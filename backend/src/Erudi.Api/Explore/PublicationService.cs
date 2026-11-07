using System.Linq.Expressions;
using Erudi.Api.Data;
using Erudi.Api.Explore.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Explore;

public abstract record Publishing
{
    private Publishing()
    {
    }

    public sealed record Published(PublicationResponse Publication) : Publishing;

    public sealed record DeckNotFound : Publishing;

    /// <summary>An empty deck would not show in the Explorer.</summary>
    public sealed record DeckEmpty : Publishing;
}

/// <summary>The author's side of the Explorer (screen 16): sharing one of their decks, or no longer sharing it.</summary>
public sealed class PublicationService(ErudiDbContext db, TimeProvider clock)
{
    private static readonly Expression<Func<DeckPublication, PublicationResponse>> ToResponse =
        p => new PublicationResponse(p.Title, p.Category, p.Description, p.PublishedAt, p.UpdatedAt);

    /// <returns>The publication, or <c>null</c> when the deck is not the owner's or is not published.</returns>
    public Task<PublicationResponse?> FindAsync(Guid ownerId, Guid deckId, CancellationToken cancellationToken) =>
        Owned(ownerId, deckId).Select(ToResponse).SingleOrDefaultAsync(cancellationToken);

    /// <summary>Publishes the deck, or updates its publication while keeping the first publication date.</summary>
    public async Task<Publishing> PublishAsync(Guid ownerId, Guid deckId, PublicationRequest request, CancellationToken cancellationToken)
    {
        var deck = await db.Decks
            .Where(d => d.Id == deckId && d.OwnerId == ownerId)
            .Select(d => new { HasCards = d.Cards.Any() })
            .SingleOrDefaultAsync(cancellationToken);

        if (deck is null)
        {
            return new Publishing.DeckNotFound();
        }

        if (!deck.HasCards)
        {
            return new Publishing.DeckEmpty();
        }

        var title = request.Title.Trim();
        var category = request.Category!.Value.ToString();
        var description = request.Description?.Trim() ?? "";
        var now = clock.GetUtcNow();

        // An upsert, so two simultaneous first publications cannot both insert. The interpolated
        // values become SQL parameters, never text pasted into the query.
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO deck_publications (deck_id, title, category, description, published_at, updated_at)
            VALUES ({deckId}, {title}, {category}, {description}, {now}, {now})
            ON CONFLICT (deck_id) DO UPDATE SET
                title = EXCLUDED.title,
                category = EXCLUDED.category,
                description = EXCLUDED.description,
                updated_at = EXCLUDED.updated_at
            """,
            cancellationToken);

        return new Publishing.Published(await Owned(ownerId, deckId).Select(ToResponse).SingleAsync(cancellationToken));
    }

    /// <summary>Removes the deck from the Explorer. Copies already made stay with their learners.</summary>
    public async Task<bool> UnpublishAsync(Guid ownerId, Guid deckId, CancellationToken cancellationToken) =>
        await Owned(ownerId, deckId).ExecuteDeleteAsync(cancellationToken) > 0;

    private IQueryable<DeckPublication> Owned(Guid ownerId, Guid deckId) =>
        db.DeckPublications.Where(p => p.DeckId == deckId && p.Deck.OwnerId == ownerId);
}
