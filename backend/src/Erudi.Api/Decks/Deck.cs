using Erudi.Api.Explore;

namespace Erudi.Api.Decks;

/// <summary>A subject ("Anglais", "Permis"…) holding a learner's cards.</summary>
public sealed class Deck
{
    public Guid Id { get; init; }

    public Guid OwnerId { get; init; }

    public string Name { get; set; } = "";

    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>The last change to the name or the cards' text, shown in the Explorer. Moving cards between boxes does not count.</summary>
    public DateTimeOffset UpdatedAt { get; set; }

    public List<Card> Cards { get; init; } = [];

    /// <summary>Set while the deck is shared in the Explorer.</summary>
    public DeckPublication? Publication { get; init; }
}
