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
    /// <summary>Longer sessions tire more than they teach; the learner can start another one.</summary>
    public const int QuizSize = 50;

    public const int PracticeSize = 20;

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

        return new StudySummaryResponse(reviewedToday, dueCount, boxes);
    }

    /// <returns>The due cards, or <c>null</c> when <paramref name="deckId"/> is not the learner's deck.</returns>
    public async Task<IReadOnlyList<StudyCardResponse>?> QuizAsync(Guid userId, Guid? deckId, CancellationToken cancellationToken)
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
            .Take(QuizSize)
            .Select(ToResponse)
            .ToListAsync(cancellationToken);
    }

    /// <returns>Random cards, due or not, or <c>null</c> when <paramref name="deckId"/> is not the learner's deck.</returns>
    public async Task<IReadOnlyList<StudyCardResponse>?> PracticeAsync(Guid userId, Guid? deckId, CancellationToken cancellationToken)
    {
        if (await ScopeAsync(userId, deckId, cancellationToken) is not { } cards)
        {
            return null;
        }

        return await cards
            .OrderBy(_ => EF.Functions.Random())
            .Take(PracticeSize)
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
