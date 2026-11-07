using System.ComponentModel.DataAnnotations;

namespace Erudi.Api.Decks.Contracts;

// [Required] also refuses strings made only of spaces; the services store them trimmed.

public sealed class DeckRequest
{
    [Required, StringLength(DeckRules.NameMaxLength)]
    public string Name { get; init; } = "";
}

public sealed class CardRequest
{
    [Required, StringLength(DeckRules.CardSideMaxLength)]
    public string Front { get; init; } = "";

    [Required, StringLength(DeckRules.CardSideMaxLength)]
    public string Back { get; init; } = "";
}

/// <param name="DueCount">Cards the quiz asks today.</param>
/// <param name="Level">The average box, rounded: 0 for an empty deck, otherwise 1 to 5.</param>
public sealed record DeckResponse(Guid Id, string Name, int CardCount, int DueCount, int Level);

public sealed record CardSummaryResponse(Guid Id, string Front, int Box);

public sealed record CardResponse(Guid Id, Guid DeckId, string Front, string Back, int Box);
