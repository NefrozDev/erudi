import { cardTextSize } from './card-text-size';

describe('cardTextSize', () => {
  it.each([
    ['', 'xl'],
    ['Bruxelles', 'xl'],
    ['a'.repeat(12), 'xl'],
    ['a'.repeat(13), 'l'],
    ['to look forward to', 'l'],
    ['a'.repeat(40), 'l'],
    ['a'.repeat(41), 'm'],
    ['a'.repeat(120), 'm'],
    ['a'.repeat(121), 's'],
    ['a'.repeat(300), 's'],
    ['a'.repeat(301), 'xs'],
    ['a'.repeat(1000), 'xs'],
  ])('should size a text of %j as %s', (text, size) => {
    expect(cardTextSize(text)).toBe(size);
  });

  it('should count line breaks as room taken', () => {
    expect(cardTextSize('Indépendance')).toBe('xl');
    // 27 characters and a break: as much room as 52 characters on one line.
    expect(cardTextSize('Indépendance\nde la Belgique')).toBe('m');
    expect(cardTextSize('un\ndeux\ntrois\nquatre\ncinq')).toBe('s');
  });
});
