using Erudi.Api.Study;

namespace Erudi.Api.Decks;

public sealed class Card
{
    public Guid Id { get; init; }

    public Guid DeckId { get; init; }

    public Deck Deck { get; init; } = null!;

    /// <summary>The question or word, shown first.</summary>
    public string Front { get; set; } = "";

    /// <summary>The answer, shown once the card is turned over.</summary>
    public string Back { get; set; } = "";

    public int Box { get; set; } = LeitnerSchedule.FirstBox;

    /// <summary>The learner's day from which the quiz asks the card again (see <see cref="StudyCalendar"/>).</summary>
    public DateOnly DueOn { get; set; }

    public DateTimeOffset CreatedAt { get; init; }
}
