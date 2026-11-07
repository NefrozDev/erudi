// Mirror the API's rules (backend Decks/DeckRules.cs), so most mistakes are caught before sending.
export const DECK_NAME_MAX_LENGTH = 60;
export const CARD_SIDE_MAX_LENGTH = 1000;

/** At least one visible character: the API refuses text made only of spaces. */
export const NOT_BLANK = /\S/;
