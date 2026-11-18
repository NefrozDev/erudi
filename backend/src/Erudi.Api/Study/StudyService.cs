using System.Linq.Expressions;
using Erudi.Api.Data;
using Erudi.Api.Decks;
using Erudi.Api.Study.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Study;

public abstract record AnswerResult
{
    private AnswerResult()
    {
    }

    public sealed record Recorded(AnswerResponse Answer) : AnswerResult;

    public sealed record CardNotFound : AnswerResult;

    /// <summary>Already answered today, or not due yet.</summary>
    public sealed record NotDue : AnswerResult;
}

/// <summary>
/// The two ways to study. The quiz asks the due cards and moves them between boxes; practice
/// asks random cards and changes nothing, so a learner can test themselves at any time.
/// </summary>
public sealed class StudyService(ErudiDbContext db, StudyCalendar calendar, TimeProvider clock)
{
    /// <summary>
    /// A quiz's size unless the learner picks one: longer sessions tire more than they teach, and
    /// the learner can go on with another one.
    /// </summary>
    public const int QuizSize = 50;

    public const int PracticeSize = 20;

    /// <summary>The most cards a learner can ask for: a whole deck.</summary>
    public const int MaxSessionSize = DeckRules.MaxCardsPerDeck;

    /// <summary>The learner's pace until enough answers tell their own.</summary>
    public const int DefaultSecondsPerCard = 10;

    /// <summary>The days of activity the statistics show, today included.</summary>
    public const int ActivityDays = 14;

    /// <summary>The success rate counts the answers of these last days, today included.</summary>
    public const int SuccessRateDays = 30;

    private const int PaceSampleSize = 500;
    private const int MinPaceSamples = 10;

    // A longer gap between two answers is a break, not the time a card took.
    private static readonly TimeSpan MaxSecondsOnACard = TimeSpan.FromMinutes(2);

    private static readonly Expression<Func<Card, StudyCardResponse>> ToResponse =
        c => new StudyCardResponse(c.Id, c.DeckId, c.Deck.Name, c.Front, c.Back, c.Box);

    public async Task<StudySummaryResponse> SummarizeAsync(Guid userId, CancellationToken cancellationToken)
    {
        var today = calendar.Today();
        var cards = OwnedCards(userId);

        var reviewedToday = await db.CardReviews.CountAsync(r => r.UserId == userId && r.StudyDay == today, cancellationToken);
        var dueCount = await cards.CountAsync(c => c.DueOn <= today, cancellationToken);
        var perBox = await cards
            .GroupBy(c => c.Box)
            .Select(g => new { Box = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var boxes = new int[LeitnerSchedule.LastBox];
        foreach (var box in perBox)
        {
            boxes[box.Box - LeitnerSchedule.FirstBox] = box.Count;
        }

        var studyDays = await db.CardReviews.Where(r => r.UserId == userId).Select(r => r.StudyDay).Distinct().ToListAsync(cancellationToken);

        return new StudySummaryResponse(
            reviewedToday,
            dueCount,
            boxes,
            await SecondsPerCardAsync(userId, cancellationToken),
            StudyStreaks.Of(studyDays, today).Current);
    }

    /// <summary>The learner's whole progress: streaks, recent activity, success rate and pace.</summary>
    public async Task<StudyStatsResponse> StatsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var today = calendar.Today();
        var reviews = db.CardReviews.Where(r => r.UserId == userId);

        var studyDays = await reviews.Select(r => r.StudyDay).Distinct().ToListAsync(cancellationToken);
        var (currentStreak, bestStreak) = StudyStreaks.Of(studyDays, today);

        var firstActivityDay = today.AddDays(1 - ActivityDays);
        var perDay = await reviews
            .Where(r => r.StudyDay >= firstActivityDay)
            .GroupBy(r => r.StudyDay)
            .Select(g => new { Day = g.Key, Reviews = g.Count(), Known = g.Count(r => r.Knew) })
            .ToDictionaryAsync(d => d.Day, cancellationToken);
        var lastDays = Enumerable.Range(0, ActivityDays)
            .Select(firstActivityDay.AddDays)
            .Select(day => perDay.TryGetValue(day, out var d) ? new DayActivityResponse(day, d.Reviews, d.Known) : new DayActivityResponse(day, 0, 0))
            .ToList();

        var cards = OwnedCards(userId);
        return new StudyStatsResponse(
            currentStreak,
            bestStreak,
            StudiedToday: studyDays.Contains(today),
            StudyDays: studyDays.Count,
            TotalReviews: await reviews.CountAsync(cancellationToken),
            SuccessRate: await SuccessRateAsync(reviews, today, cancellationToken),
            CardCount: await cards.CountAsync(cancellationToken),
            MasteredCount: await cards.CountAsync(c => c.Box >= LeitnerSchedule.MasteredFromBox, cancellationToken),
            lastDays,
            await SecondsPerCardAsync(userId, cancellationToken));
    }

    /// <returns>A deck's boxes and answers, or <c>null</c> when it is not the learner's deck.</returns>
    public async Task<DeckStatsResponse?> DeckStatsAsync(Guid userId, Guid deckId, CancellationToken cancellationToken)
    {
        if (await ScopeAsync(userId, deckId, cancellationToken) is not { } cards)
        {
            return null;
        }

        var perBox = await cards
            .GroupBy(c => c.Box)
            .Select(g => new { Box = g.Key, Count = g.Count() })
            .ToDictionaryAsync(b => b.Box, b => b.Count, cancellationToken);
        var boxes = Enumerable.Range(LeitnerSchedule.FirstBox, LeitnerSchedule.LastBox)
            .Select(box => perBox.GetValueOrDefault(box))
            .ToList();

        // The answers about the deck's current cards: a deleted card's answers lose their card.
        var reviews = db.CardReviews.Where(r => r.UserId == userId && cards.Any(c => c.Id == r.CardId));
        var today = calendar.Today();

        return new DeckStatsResponse(
            boxes,
            TotalReviews: await reviews.CountAsync(cancellationToken),
            SuccessRate: await SuccessRateAsync(reviews, today, cancellationToken),
            LastStudiedOn: await reviews.MaxAsync(r => (DateOnly?)r.StudyDay, cancellationToken),
            await SecondsPerCardAsync(userId, cancellationToken));
    }

    /// <returns>The share of known answers of the last <see cref="SuccessRateDays"/> days in percent, or <c>null</c> without answers.</returns>
    private static async Task<int?> SuccessRateAsync(IQueryable<CardReview> reviews, DateOnly today, CancellationToken cancellationToken)
    {
        var since = today.AddDays(1 - SuccessRateDays);
        var recent = await reviews
            .Where(r => r.StudyDay >= since)
            .GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Known = g.Count(r => r.Knew) })
            .SingleOrDefaultAsync(cancellationToken);

        return recent is null ? null : (int)Math.Round(100.0 * recent.Known / recent.Count, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// The median time between two quiz answers of the learner's latest ones, breaks left out:
    /// how long a card takes them, to estimate a session's length.
    /// </summary>
    private async Task<int> SecondsPerCardAsync(Guid userId, CancellationToken cancellationToken)
    {
        var times = await db.CardReviews
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.ReviewedAt)
            .Take(PaceSampleSize)
            .Select(r => r.ReviewedAt)
            .ToListAsync(cancellationToken);

        var seconds = times
            .Zip(times.Skip(1), (later, earlier) => later - earlier)
            .Where(gap => gap > TimeSpan.Zero && gap <= MaxSecondsOnACard)
            .Select(gap => gap.TotalSeconds)
            .Order()
            .ToList();

        return seconds.Count < MinPaceSamples
            ? DefaultSecondsPerCard
            : Math.Max(1, (int)Math.Round(seconds[seconds.Count / 2], MidpointRounding.AwayFromZero));
    }

    /// <returns>
    /// At most <paramref name="count"/> due cards (<see cref="QuizSize"/> by default), or
    /// <c>null</c> when <paramref name="deckId"/> is not the learner's deck.
    /// </returns>
    public async Task<IReadOnlyList<StudyCardResponse>?> QuizAsync(Guid userId, Guid? deckId, int? count, CancellationToken cancellationToken)
    {
        if (await ScopeAsync(userId, deckId, cancellationToken) is not { } cards)
        {
            return null;
        }

        var today = calendar.Today();
        return await cards
            .Where(c => c.DueOn <= today)
            // The least known cards first, then the longest overdue.
            .OrderBy(c => c.Box).ThenBy(c => c.DueOn).ThenBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Take(count ?? QuizSize)
            .Select(ToResponse)
            .ToListAsync(cancellationToken);
    }

    /// <param name="box">Only the cards of this box.</param>
    /// <param name="onlyFailed">Only the cards whose last quiz answer was "I did not know".</param>
    /// <returns>
    /// At most <paramref name="count"/> random cards (<see cref="PracticeSize"/> by default), due
    /// or not, or <c>null</c> when <paramref name="deckId"/> is not the learner's deck.
    /// </returns>
    public async Task<IReadOnlyList<StudyCardResponse>?> PracticeAsync(
        Guid userId,
        Guid? deckId,
        int? count,
        int? box,
        bool onlyFailed,
        CancellationToken cancellationToken)
    {
        if (await ScopeAsync(userId, deckId, cancellationToken) is not { } cards)
        {
            return null;
        }

        if (box is { } only)
        {
            cards = cards.Where(c => c.Box == only);
        }

        if (onlyFailed)
        {
            // A card never answered, or answered right last time, stays out. Practice answers
            // are not stored, so only the quiz counts.
            cards = cards.Where(c => db.CardReviews
                .Where(r => r.CardId == c.Id)
                .OrderByDescending(r => r.ReviewedAt).ThenByDescending(r => r.Id)
                .Select(r => (bool?)r.Knew)
                .FirstOrDefault() == false);
        }

        return await cards
            .OrderBy(_ => EF.Functions.Random())
            .Take(count ?? PracticeSize)
            .Select(ToResponse)
            .ToListAsync(cancellationToken);
    }

    public async Task<AnswerResult> AnswerAsync(Guid userId, Guid cardId, bool knew, CancellationToken cancellationToken)
    {
        var card = await OwnedCards(userId)
            .Where(c => c.Id == cardId)
            .Select(c => new { c.Box, c.DueOn })
            .SingleOrDefaultAsync(cancellationToken);

        if (card is null)
        {
            return new AnswerResult.CardNotFound();
        }

        var today = calendar.Today();
        if (card.DueOn > today)
        {
            return new AnswerResult.NotDue();
        }

        var (box, dueOn) = LeitnerSchedule.After(card.Box, knew, today);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Moves the card only if it is still where it was read: a double tap, or a second tab
        // answering the same card, must not move it twice. PostgreSQL re-checks this condition
        // after waiting for a concurrent update of the row.
        var moved = await db.Cards
            .Where(c => c.Id == cardId && c.Box == card.Box && c.DueOn == card.DueOn)
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.Box, box).SetProperty(c => c.DueOn, dueOn), cancellationToken);

        if (moved == 0)
        {
            return new AnswerResult.NotDue();
        }

        var now = clock.GetUtcNow();
        db.CardReviews.Add(new CardReview
        {
            Id = Guid.CreateVersion7(now),
            UserId = userId,
            CardId = cardId,
            StudyDay = today,
            Knew = knew,
            FromBox = card.Box,
            ToBox = box,
            ReviewedAt = now,
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new AnswerResult.Recorded(new AnswerResponse(box, dueOn));
    }

    private IQueryable<Card> OwnedCards(Guid userId) => db.Cards.Where(c => c.Deck.OwnerId == userId);

    private async Task<IQueryable<Card>?> ScopeAsync(Guid userId, Guid? deckId, CancellationToken cancellationToken)
    {
        if (deckId is not { } id)
        {
            return OwnedCards(userId);
        }

        var owned = await db.Decks.AnyAsync(d => d.Id == id && d.OwnerId == userId, cancellationToken);
        return owned ? db.Cards.Where(c => c.DeckId == id) : null;
    }
}
