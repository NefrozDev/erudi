/** From a single word in large type down to a paragraph in body size. */
export type CardTextSize = 'xl' | 'l' | 'm' | 's' | 'xs';

// Each line break takes about as much room as this many characters.
const LINE_WEIGHT = 25;

const SIZES: readonly (readonly [number, CardTextSize])[] = [
  [12, 'xl'],
  [40, 'l'],
  [120, 'm'],
  [300, 's'],
];

/** Picks a card text's size from its length, so a long answer fits the card without scrolling. */
export function cardTextSize(text: string): CardTextSize {
  const breaks = text.split('\n').length - 1;
  const weight = text.length + breaks * LINE_WEIGHT;
  return SIZES.find(([max]) => weight <= max)?.[1] ?? 'xs';
}
