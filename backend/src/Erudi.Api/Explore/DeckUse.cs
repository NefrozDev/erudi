namespace Erudi.Api.Explore;

/// <summary>A learner who tested or copied a public deck. The Explorer counts each learner once.</summary>
public sealed class DeckUse
{
    public Guid DeckId { get; init; }

    public Guid UserId { get; init; }

    public DateTimeOffset FirstUsedAt { get; init; }

    /// <summary>The best test score in percent; null for a learner who only copied the deck.</summary>
    public int? BestScore { get; set; }
}
