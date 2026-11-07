using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Study.Contracts;

public sealed class AnswerRequest
{
    // Nullable so that a missing value is a validation error rather than a silent default:
    // a missing "knew" must not send the card back to box 1.
    [Required]
    public Guid? CardId { get; init; }

    [Required]
    public bool? Knew { get; init; }
}

/// <param name="ReviewedToday">Quiz answers given today.</param>
/// <param name="DueCount">Cards the quiz still asks today, in every deck.</param>
/// <param name="Boxes">How many cards each box holds, from box 1 to box 5.</param>
public sealed record StudySummaryResponse(int ReviewedToday, int DueCount, IReadOnlyList<int> Boxes);

public sealed record StudyCardResponse(Guid Id, Guid DeckId, string DeckName, string Front, string Back, int Box);

public sealed record AnswerResponse(int Box, DateOnly DueOn);
