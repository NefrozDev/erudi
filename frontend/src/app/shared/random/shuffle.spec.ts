import { shuffle } from './shuffle';

describe('shuffle', () => {
  it('should return every item once, without touching the original', () => {
    const items = [1, 2, 3, 4, 5];

    const shuffled = shuffle(items);

    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled).not.toBe(items);
  });

  it('should follow the random numbers given', () => {
    // Always 0: each item swaps with the first one.
    expect(shuffle(['a', 'b', 'c'], () => 0)).toEqual(['b', 'c', 'a']);
    // Just under 1: each item stays in place.
    expect(shuffle(['a', 'b', 'c'], () => 0.999)).toEqual(['a', 'b', 'c']);
  });

  it('should handle empty and single lists', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['a'])).toEqual(['a']);
  });
});
