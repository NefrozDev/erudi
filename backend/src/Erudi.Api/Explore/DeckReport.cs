namespace Erudi.Api.Explore;

/// <summary>A learner's report about a public deck, for moderation. One per learner and deck.</summary>
public sealed class DeckReport
{
    public Guid Id { get; init; }

    public Guid DeckId { get; init; }

    public Guid ReporterId { get; init; }

    public ReportReason Reason { get; set; }

    /// <summary>Empty when the learner wrote none.</summary>
    public string Details { get; set; } = "";

    public DateTimeOffset ReportedAt { get; set; }
}
