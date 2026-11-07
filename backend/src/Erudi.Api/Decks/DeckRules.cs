namespace Erudi.Api.Decks;

/// <summary>Deck and card rules shared by validation, persistence and the services.</summary>
public static class DeckRules
{
    public const int NameMaxLength = 60;
    public const int CardSideMaxLength = 1000;

    // Far above what a learner types by hand: they only stop a script from filling the database.
    public const int MaxDecksPerUser = 200;
    public const int MaxCardsPerDeck = 2000;
}
