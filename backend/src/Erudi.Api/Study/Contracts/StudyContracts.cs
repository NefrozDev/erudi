using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Study.Contracts;

public sealed class QuizQuery
{
    /// <summary>One of the learner's decks; every deck when absent.</summary>
    public Guid? DeckId { get; init; }

    [Range(1, StudyService.MaxSessionSize)]
    public int? Count { get; init; }
}

public sealed class PracticeQuery
{
    /// <summary>One of the learner's decks; every deck when absent.</summary>
    public Guid? DeckId { get; init; }

    [Range(1, StudyService.MaxSessionSize)]
    public int? Count { get; init; }

    [Range(LeitnerSchedule.FirstBox, LeitnerSchedule.LastBox)]
    public int? Box { get; init; }

    /// <summary>Only the cards whose last quiz answer was "I did not know".</summary>
    public bool Failed { get; init; }
}

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
/// <param name="SecondsPerCard">The learner's usual time on a card, to estimate a session.</param>
/// <param name="CurrentStreak">Days in a row with a quiz answer, up to today or yesterday.</param>
public sealed record StudySummaryResponse(int ReviewedToday, int DueCount, IReadOnlyList<int> Boxes, int SecondsPerCard, int CurrentStreak);

/// <param name="CurrentStreak">Days in a row with a quiz answer, up to today or yesterday.</param>
/// <param name="StudyDays">Days with at least one quiz answer.</param>
/// <param name="SuccessRate">Known answers of the last 30 days in percent; <c>null</c> without any.</param>
/// <param name="MasteredCount">Cards in the last boxes (<see cref="LeitnerSchedule.MasteredFromBox"/>).</param>
/// <param name="LastDays">The last 14 days, oldest first, today last.</param>
public sealed record StudyStatsResponse(
    int CurrentStreak,
    int BestStreak,
    bool StudiedToday,
    int StudyDays,
    int TotalReviews,
    int? SuccessRate,
    int CardCount,
    int MasteredCount,
    IReadOnlyList<DayActivityResponse> LastDays,
    int SecondsPerCard);

/// <param name="Known">Answers "I knew" among <paramref name="Reviews"/>.</param>
public sealed record DayActivityResponse(DateOnly Day, int Reviews, int Known);

/// <param name="Boxes">How many of the deck's cards each box holds, from box 1 to box 5.</param>
/// <param name="TotalReviews">Quiz answers about the deck's current cards.</param>
/// <param name="SuccessRate">Known answers of the last 30 days in percent; <c>null</c> without any.</param>
/// <param name="SecondsPerCard">The learner's usual time on a card, to estimate a session.</param>
public sealed record DeckStatsResponse(
    IReadOnlyList<int> Boxes,
    int TotalReviews,
    int? SuccessRate,
    DateOnly? LastStudiedOn,
    int SecondsPerCard);

public sealed record StudyCardResponse(Guid Id, Guid DeckId, string DeckName, string Front, string Back, int Box);

public sealed record AnswerResponse(int Box, DateOnly DueOn);
