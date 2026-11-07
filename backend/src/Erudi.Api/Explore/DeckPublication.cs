using Erudi.Api.Decks;

namespace Erudi.Api.Explore;

/// <summary>
/// A deck shared in the Explorer. The cards stay the owner's: the Explorer shows them as they
/// are now, and copies take them as they are when copied.
/// </summary>
public sealed class DeckPublication
{
    public Guid DeckId { get; init; }

    public Deck Deck { get; init; } = null!;

    public string Title { get; set; } = "";

    public DeckCategory Category { get; set; }

    /// <summary>Empty when the author wrote none.</summary>
    public string Description { get; set; } = "";

    public DateTimeOffset PublishedAt { get; init; }

    public DateTimeOffset UpdatedAt { get; set; }
}
