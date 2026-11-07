using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Explore.Contracts;

// Enums are nullable and [Required] so that a missing value is an error rather than the first
// member. [EnumDataType] refuses numbers that name no member ("category": 9).

public sealed class PublicationRequest
{
    [Required, StringLength(ExploreRules.TitleMaxLength)]
    public string Title { get; init; } = "";

    [Required, EnumDataType(typeof(DeckCategory))]
    public DeckCategory? Category { get; init; }

    [StringLength(ExploreRules.DescriptionMaxLength)]
    public string? Description { get; init; }
}

public sealed record PublicationResponse(
    string Title,
    DeckCategory Category,
    string Description,
    DateTimeOffset PublishedAt,
    DateTimeOffset UpdatedAt);

/// <param name="UseCount">Learners, other than the author, who tested or copied the deck.</param>
public sealed record PublicDeckSummaryResponse(
    Guid Id,
    string Title,
    DeckCategory Category,
    string Author,
    int CardCount,
    int UseCount);

public sealed record CardPreviewResponse(string Front, string Back);

/// <param name="UpdatedAt">The last change to the publication, the deck's name or its cards.</param>
/// <param name="Preview">The deck's first card; null when it has none left.</param>
/// <param name="IsMine">The signed-in learner is the author.</param>
/// <param name="BestScore">The learner's best test score in percent; null before a first test.</param>
public sealed record PublicDeckResponse(
    Guid Id,
    string Title,
    DeckCategory Category,
    string Description,
    string Author,
    DateTimeOffset UpdatedAt,
    int CardCount,
    int UseCount,
    CardPreviewResponse? Preview,
    bool IsMine,
    int? BestScore);

/// <param name="DeckName">The publication's title, shown on each card like in the other sessions.</param>
public sealed record TestCardResponse(Guid Id, string DeckName, string Front, string Back);

/// <summary>The learner's own count of "Je savais": the score only matters to them.</summary>
public sealed class TestResultRequest : IValidatableObject
{
    [Required, Range(0, ExploreRules.TestSize)]
    public int? Known { get; init; }

    [Required, Range(1, ExploreRules.TestSize)]
    public int? Total { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Known > Total)
        {
            yield return new ValidationResult("Known cannot exceed total.", ["known"]);
        }
    }
}

/// <param name="Score">This test's score in percent.</param>
/// <param name="BestScore">The learner's best score on this deck, this test included.</param>
public sealed record TestResultResponse(int Score, int BestScore);

public sealed class ReportRequest
{
    [Required, EnumDataType(typeof(ReportReason))]
    public ReportReason? Reason { get; init; }

    [StringLength(ExploreRules.ReportDetailsMaxLength)]
    public string? Details { get; init; }
}
