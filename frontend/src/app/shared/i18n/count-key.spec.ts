import { countKey } from './count-key';

describe('countKey', () => {
  it.each([
    [0, 'decks.cards.one'],
    [1, 'decks.cards.one'],
    [2, 'decks.cards.other'],
    [120, 'decks.cards.other'],
  ])('should pick the French form for %s', (count, key) => {
    expect(countKey('decks.cards', count)).toBe(key);
  });
});
