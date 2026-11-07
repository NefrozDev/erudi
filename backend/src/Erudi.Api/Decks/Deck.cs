namespace Erudi.Api.Decks;

/// <summary>A subject ("Anglais", "Permis"…) holding a learner's cards.</summary>
public sealed class Deck
{
    public Guid Id { get; init; }

    public Guid OwnerId { get; init; }

    public string Name { get; set; } = "";

    public DateTimeOffset CreatedAt { get; init; }

    public List<Card> Cards { get; init; } = [];
}
