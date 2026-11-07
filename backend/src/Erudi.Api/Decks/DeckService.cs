using Erudi.Api.Data;
using Erudi.Api.Decks.Contracts;
using Erudi.Api.Study;
using Microsoft.EntityFrameworkCore;

namespace Erudi.Api.Decks;

public abstract record DeckCreation
{
    private DeckCreation()
    {
    }

    public sealed record Created(DeckResponse Deck) : DeckCreation;

    public sealed record LimitReached : DeckCreation;
}

public abstract record CardCreation
{
    private CardCreation()
    {
    }

    public sealed record Created(CardResponse Card) : CardCreation;

    public sealed record DeckNotFound : CardCreation;

    public sealed record LimitReached : CardCreation;
}

/// <summary>
/// A learner's decks and cards. Every query is scoped to the owner: someone else's deck or card
/// is reported as missing, never as forbidden, so guessing ids reveals nothing.
/// </summary>
public sealed class DeckService(ErudiDbContext db, StudyCalendar calendar, TimeProvider clock)
{
    public async Task<IReadOnlyList<DeckResponse>> ListAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        var rows = await Summaries(db.Decks.Where(d => d.OwnerId == ownerId)).ToListAsync(cancellationToken);
        return [.. rows.Select(ToResponse)];
    }

    public async Task<DeckResponse?> FindAsync(Guid ownerId, Guid deckId, CancellationToken cancellationToken)
    {
        var row = await Summaries(OwnedDeck(ownerId, deckId)).SingleOrDefaultAsync(cancellationToken);
        return row is null ? null : ToResponse(row);
    }

    public async Task<DeckCreation> CreateAsync(Guid ownerId, string name, CancellationToken cancellationToken)
    {
        // Two simultaneous requests can both pass this check: the limit stops scripts, it is
        // not an exact quota.
        if (await db.Decks.CountAsync(d => d.OwnerId == ownerId, cancellationToken) >= DeckRules.MaxDecksPerUser)
        {
            return new DeckCreation.LimitReached();
        }

        var now = clock.GetUtcNow();
        var deck = new Deck { Id = Guid.CreateVersion7(now), OwnerId = ownerId, Name = name.Trim(), CreatedAt = now, UpdatedAt = now };
        db.Decks.Add(deck);
        await db.SaveChangesAsync(cancellationToken);

        return new DeckCreation.Created(new DeckResponse(deck.Id, deck.Name, CardCount: 0, DueCount: 0, Level: 0, Published: false));
    }

    public async Task<DeckResponse?> RenameAsync(Guid ownerId, Guid deckId, string name, CancellationToken cancellationToken)
    {
        var trimmed = name.Trim();
        var now = clock.GetUtcNow();
        var renamed = await OwnedDeck(ownerId, deckId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(d => d.Name, trimmed).SetProperty(d => d.UpdatedAt, now), cancellationToken);

        return renamed == 0 ? null : await FindAsync(ownerId, deckId, cancellationToken);
    }

    /// <summary>The database deletes the deck's cards with it (ON DELETE CASCADE).</summary>
    public async Task<bool> DeleteAsync(Guid ownerId, Guid deckId, CancellationToken cancellationToken) =>
        await OwnedDeck(ownerId, deckId).ExecuteDeleteAsync(cancellationToken) > 0;

    /// <returns>The cards in creation order, or <c>null</c> when the deck is not the owner's.</returns>
    public async Task<IReadOnlyList<CardSummaryResponse>?> ListCardsAsync(Guid ownerId, Guid deckId, CancellationToken cancellationToken)
    {
        if (!await OwnedDeck(ownerId, deckId).AnyAsync(cancellationToken))
        {
            return null;
        }

        return await db.Cards
            .Where(c => c.DeckId == deckId)
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Select(c => new CardSummaryResponse(c.Id, c.Front, c.Box))
            .ToListAsync(cancellationToken);
    }

    public async Task<CardCreation> AddCardAsync(Guid ownerId, Guid deckId, CardRequest request, CancellationToken cancellationToken)
    {
        var deck = await OwnedDeck(ownerId, deckId)
            .Select(d => new { CardCount = d.Cards.Count })
            .SingleOrDefaultAsync(cancellationToken);

        if (deck is null)
        {
            return new CardCreation.DeckNotFound();
        }

        if (deck.CardCount >= DeckRules.MaxCardsPerDeck)
        {
            return new CardCreation.LimitReached();
        }

        var now = clock.GetUtcNow();
        var card = new Card
        {
            Id = Guid.CreateVersion7(now),
            DeckId = deckId,
            Front = request.Front.Trim(),
            Back = request.Back.Trim(),
            Box = LeitnerSchedule.FirstBox,
            // A new card can be studied right away.
            DueOn = calendar.Today(),
            CreatedAt = now,
        };
        db.Cards.Add(card);
        await db.SaveChangesAsync(cancellationToken);
        await TouchAsync(deckId, now, cancellationToken);

        return new CardCreation.Created(ToResponse(card));
    }

    public Task<CardResponse?> FindCardAsync(Guid ownerId, Guid cardId, CancellationToken cancellationToken) =>
        OwnedCard(ownerId, cardId)
            .Select(c => new CardResponse(c.Id, c.DeckId, c.Front, c.Back, c.Box))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<CardResponse?> UpdateCardAsync(Guid ownerId, Guid cardId, CardRequest request, CancellationToken cancellationToken)
    {
        var card = await OwnedCard(ownerId, cardId).SingleOrDefaultAsync(cancellationToken);
        if (card is null)
        {
            return null;
        }

        // The box stays: fixing a typo does not mean the learner knows the card less.
        card.Front = request.Front.Trim();
        card.Back = request.Back.Trim();
        await db.SaveChangesAsync(cancellationToken);
        await TouchAsync(card.DeckId, clock.GetUtcNow(), cancellationToken);

        return ToResponse(card);
    }

    public async Task<bool> DeleteCardAsync(Guid ownerId, Guid cardId, CancellationToken cancellationToken)
    {
        var deckId = await OwnedCard(ownerId, cardId).Select(c => (Guid?)c.DeckId).SingleOrDefaultAsync(cancellationToken);
        if (deckId is not { } id || await OwnedCard(ownerId, cardId).ExecuteDeleteAsync(cancellationToken) == 0)
        {
            return false;
        }

        await TouchAsync(id, clock.GetUtcNow(), cancellationToken);
        return true;
    }

    /// <summary>Dates the change of a deck's cards for the Explorer ("mis à jour il y a 3 jours").</summary>
    private Task<int> TouchAsync(Guid deckId, DateTimeOffset now, CancellationToken cancellationToken) =>
        db.Decks.Where(d => d.Id == deckId).ExecuteUpdateAsync(setters => setters.SetProperty(d => d.UpdatedAt, now), cancellationToken);

    private IQueryable<Deck> OwnedDeck(Guid ownerId, Guid deckId) =>
        db.Decks.Where(d => d.OwnerId == ownerId && d.Id == deckId);

    private IQueryable<Card> OwnedCard(Guid ownerId, Guid cardId) =>
        db.Cards.Where(c => c.Id == cardId && c.Deck.OwnerId == ownerId);

    private IQueryable<DeckRow> Summaries(IQueryable<Deck> decks)
    {
        var today = calendar.Today();
        return decks
            .OrderBy(d => d.CreatedAt).ThenBy(d => d.Id)
            .Select(d => new DeckRow(
                d.Id,
                d.Name,
                d.Cards.Count,
                d.Cards.Count(c => c.DueOn <= today),
                d.Cards.Average(c => (double?)c.Box),
                d.Publication != null));
    }

    private static DeckResponse ToResponse(DeckRow row) => new(
        row.Id,
        row.Name,
        row.CardCount,
        row.DueCount,
        row.AverageBox is { } average ? (int)Math.Round(average, MidpointRounding.AwayFromZero) : 0,
        row.Published);

    private static CardResponse ToResponse(Card card) => new(card.Id, card.DeckId, card.Front, card.Back, card.Box);

    private sealed record DeckRow(Guid Id, string Name, int CardCount, int DueCount, double? AverageBox, bool Published);
}
