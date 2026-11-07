using Erudi.Api.Decks;

namespace Erudi.Api.Explore;

/// <summary>Explorer rules shared by validation, persistence and the services.</summary>
public static class ExploreRules
{
    /// <summary>A copy takes the title as its name, so both share a length.</summary>
    public const int TitleMaxLength = DeckRules.NameMaxLength;
    public const int DescriptionMaxLength = 300;
    public const int ReportDetailsMaxLength = 500;
    public const int SearchMaxLength = 100;

    /// <summary>Enum values are stored by name.</summary>
    public const int EnumNameMaxLength = 20;

    /// <summary>The most used decks only: the search narrows the list down.</summary>
    public const int SearchResults = 50;

    /// <summary>Cards in a test of a public deck, picked at random.</summary>
    public const int TestSize = 20;
}
