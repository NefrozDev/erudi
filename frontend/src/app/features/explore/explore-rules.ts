import { DeckCategory, ReportReason } from '../../core/explore/explore-api';

// The backend's limits (ExploreRules), checked here first so the learner sees why.
export const PUBLIC_TITLE_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 300;
export const REPORT_DETAILS_MAX_LENGTH = 500;
export const SEARCH_MAX_LENGTH = 100;

/** In the order of the Explorer's chips (screen 14). */
export const DECK_CATEGORIES: readonly DeckCategory[] = [
  'languages',
  'driving',
  'studies',
  'other',
];

export const REPORT_REASONS: readonly ReportReason[] = [
  'offensive',
  'incorrect',
  'spam',
  'copyright',
  'other',
];

/** Query strings can hold anything: only a known category filters the list. */
export function toDeckCategory(value: string | undefined): DeckCategory | undefined {
  return DECK_CATEGORIES.find((category) => category === value);
}
