using Erudi.Api.Data;
using Erudi.Api.Decks;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Explore.Contracts;
using Erudi.Api.Study;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Explore;

public abstract record DeckCopy
{
    private DeckCopy()
    {
    }

    public sealed record Created(DeckResponse Deck) : DeckCopy;

    public sealed record DeckNotFound : DeckCopy;

    public sealed record LimitReached : DeckCopy;
}

/// <summary>
/// The public library (screens 14 and 15): every signed-in learner can search the published
/// decks, test themselves on one, copy it into their account or report it. A deck that is not
/// published answers as missing. Nothing here shows the author's boxes or progress.
/// </summary>
public sealed class ExploreService(ErudiDbContext db, StudyCalendar calendar, TimeProvider clock, ILogger<ExploreService> logger)
{
    private const string LikeEscape = "\\";

    /// <summary>The most used decks first. Decks without cards are left out: there is nothing to study.</summary>
    public async Task<IReadOnlyList<PublicDeckSummaryResponse>> SearchAsync(string? search, DeckCategory? category, CancellationToken cancellationToken)
    {
        var publications = db.DeckPublications.Where(p => p.Deck.Cards.Any());

        if (category is { } wanted)
        {
            publications = publications.Where(p => p.Category == wanted);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            // % and _ typed by the learner are searched as themselves, not as wildcards.
            var pattern = $"%{EscapeLike(search.Trim())}%";
            publications = publications.Where(p =>
                EF.Functions.ILike(p.Title, pattern, LikeEscape) || EF.Functions.ILike(p.Description, pattern, LikeEscape));
        }

        var decks =
            from p in publications
            join author in db.Users on p.Deck.OwnerId equals author.Id
            let useCount = db.DeckUses.Count(u => u.DeckId == p.DeckId && u.UserId != author.Id)
            orderby useCount descending, p.UpdatedAt descending, p.DeckId
            select new PublicDeckSummaryResponse(p.DeckId, p.Title, p.Category, author.Username, p.Deck.Cards.Count, useCount);

        return await decks.Take(ExploreRules.SearchResults).ToListAsync(cancellationToken);
    }

    /// <returns>The public deck, or <c>null</c> when it is not published.</returns>
    public async Task<PublicDeckResponse?> FindAsync(Guid userId, Guid deckId, CancellationToken cancellationToken)
    {
        var firstCard = db.Cards.Where(c => c.DeckId == deckId).OrderBy(c => c.CreatedAt).ThenBy(c => c.Id);

        var row = await (
            from p in db.DeckPublications
            where p.DeckId == deckId
            join author in db.Users on p.Deck.OwnerId equals author.Id
            select new
            {
                p.Title,
                p.Category,
                p.Description,
                Author = author.Username,
                AuthorId = author.Id,
                p.UpdatedAt,
                DeckUpdatedAt = p.Deck.UpdatedAt,
                CardCount = p.Deck.Cards.Count,
                UseCount = db.DeckUses.Count(u => u.DeckId == deckId && u.UserId != author.Id),
                PreviewFront = firstCard.Select(c => c.Front).FirstOrDefault(),
                PreviewBack = firstCard.Select(c => c.Back).FirstOrDefault(),
                BestScore = db.DeckUses.Where(u => u.DeckId == deckId && u.UserId == userId).Select(u => u.BestScore).FirstOrDefault(),
            }).SingleOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        return new PublicDeckResponse(
            deckId,
            row.Title,
            row.Category,
            row.Description,
            row.Author,
            row.UpdatedAt > row.DeckUpdatedAt ? row.UpdatedAt : row.DeckUpdatedAt,
            row.CardCount,
            row.UseCount,
            row is { PreviewFront: { } front, PreviewBack: { } back } ? new CardPreviewResponse(front, back) : null,
            IsMine: row.AuthorId == userId,
            row.BestScore);
    }

    /// <returns>Random cards for a test, or <c>null</c> when the deck is not published.</returns>
    public async Task<IReadOnlyList<TestCardResponse>?> TestCardsAsync(Guid deckId, CancellationToken cancellationToken)
    {
        var title = await PublishedTitleAsync(deckId, cancellationToken);
        if (title is null)
        {
            return null;
        }

        return await db.Cards
            .Where(c => c.DeckId == deckId)
            .OrderBy(_ => EF.Functions.Random())
            .Take(ExploreRules.TestSize)
            .Select(c => new TestCardResponse(c.Id, title, c.Front, c.Back))
            .ToListAsync(cancellationToken);
    }

    /// <summary>Keeps the learner's best score. The first test or copy counts the learner as a user of the deck.</summary>
    /// <returns>The scores, or <c>null</c> when the deck is not published.</returns>
    public async Task<TestResultResponse?> RecordResultAsync(Guid userId, Guid deckId, int known, int total, CancellationToken cancellationToken)
    {
        if (await PublishedTitleAsync(deckId, cancellationToken) is null)
        {
            return null;
        }

        var score = (int)Math.Round(100.0 * known / total, MidpointRounding.AwayFromZero);
        var now = clock.GetUtcNow();

        // One row per learner and deck, so taking the test again never counts twice. GREATEST
        // keeps the higher score and skips NULL, the score of a learner who only copied the deck.
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO deck_uses (deck_id, user_id, first_used_at, best_score)
            VALUES ({deckId}, {userId}, {now}, {score})
            ON CONFLICT (deck_id, user_id) DO UPDATE SET
                best_score = GREATEST(deck_uses.best_score, EXCLUDED.best_score)
            """,
            cancellationToken);

        var best = await db.DeckUses
            .Where(u => u.DeckId == deckId && u.UserId == userId)
            .Select(u => u.BestScore)
            .SingleAsync(cancellationToken);

        return new TestResultResponse(score, best ?? score);
    }

    /// <summary>
    /// Copies the deck into the learner's account as a deck of their own: the cards start in box 1
    /// and are due today. Later changes by the author do not reach the copy.
    /// </summary>
    public async Task<DeckCopy> CopyAsync(Guid userId, Guid deckId, CancellationToken cancellationToken)
    {
        var title = await PublishedTitleAsync(deckId, cancellationToken);
        if (title is null)
        {
            return new DeckCopy.DeckNotFound();
        }

        if (await db.Decks.CountAsync(d => d.OwnerId == userId, cancellationToken) >= DeckRules.MaxDecksPerUser)
        {
            return new DeckCopy.LimitReached();
        }

        var sides = await db.Cards
            .Where(c => c.DeckId == deckId)
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Select(c => new { c.Front, c.Back })
            .ToListAsync(cancellationToken);

        var now = clock.GetUtcNow();
        var today = calendar.Today();
        var copy = new Deck { Id = Guid.CreateVersion7(now), OwnerId = userId, Name = title, CreatedAt = now, UpdatedAt = now };
        copy.Cards.AddRange(sides.Select((side, index) => new Card
        {
            Id = Guid.CreateVersion7(now),
            DeckId = copy.Id,
            Front = side.Front,
            Back = side.Back,
            Box = LeitnerSchedule.FirstBox,
            DueOn = today,
            // One microsecond apart (PostgreSQL's precision), so the copy keeps the cards' order.
            CreatedAt = now.AddMicroseconds(index),
        }));

        // The copy and the use are saved together, or not at all.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        db.Decks.Add(copy);
        await db.SaveChangesAsync(cancellationToken);
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO deck_uses (deck_id, user_id, first_used_at)
            VALUES ({deckId}, {userId}, {now})
            ON CONFLICT (deck_id, user_id) DO NOTHING
            """,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var count = sides.Count;
        return new DeckCopy.Created(new DeckResponse(
            copy.Id,
            copy.Name,
            CardCount: count,
            DueCount: count,
            Level: count == 0 ? 0 : LeitnerSchedule.FirstBox,
            Published: false));
    }

    /// <summary>Records a report for moderation. Reporting again replaces the learner's previous report.</summary>
    /// <returns><c>false</c> when the deck is not published.</returns>
    public async Task<bool> ReportAsync(Guid userId, Guid deckId, ReportReason reason, string? details, CancellationToken cancellationToken)
    {
        if (await PublishedTitleAsync(deckId, cancellationToken) is null)
        {
            return false;
        }

        var now = clock.GetUtcNow();
        var id = Guid.CreateVersion7(now);
        var reasonName = reason.ToString();
        var text = details?.Trim() ?? "";

        // One report per learner and deck: a single person cannot pile reports up.
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO deck_reports (id, deck_id, reporter_id, reason, details, reported_at)
            VALUES ({id}, {deckId}, {userId}, {reasonName}, {text}, {now})
            ON CONFLICT (deck_id, reporter_id) DO UPDATE SET
                reason = EXCLUDED.reason,
                details = EXCLUDED.details,
                reported_at = EXCLUDED.reported_at
            """,
            cancellationToken);

        // There is no moderation screen yet: the log is where reports show up. The learner's
        // text stays out of it.
        logger.LogWarning("Public deck {DeckId} reported: {Reason}", deckId, reason);
        return true;
    }

    private Task<string?> PublishedTitleAsync(Guid deckId, CancellationToken cancellationToken) =>
        db.DeckPublications.Where(p => p.DeckId == deckId).Select(p => p.Title).SingleOrDefaultAsync(cancellationToken);

    private static string EscapeLike(string text) =>
        text.Replace(LikeEscape, LikeEscape + LikeEscape, StringComparison.Ordinal)
            .Replace("%", LikeEscape + "%", StringComparison.Ordinal)
            .Replace("_", LikeEscape + "_", StringComparison.Ordinal);
}
