namespace Erudi.Api.Study;

/// <summary>
/// One quiz answer. Kept when the card is deleted (its id becomes null), so the day's count
/// and later statistics do not shrink.
/// </summary>
public sealed class CardReview
{
    public Guid Id { get; init; }

    public Guid UserId { get; init; }

    public Guid? CardId { get; init; }

    /// <summary>The learner's day of the answer (see <see cref="StudyCalendar"/>).</summary>
    public DateOnly StudyDay { get; init; }

    public bool Knew { get; init; }

    public int FromBox { get; init; }

    public int ToBox { get; init; }

    public DateTimeOffset ReviewedAt { get; init; }
}
