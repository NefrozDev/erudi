/**
 * Picks the singular or plural form of a translation: `key.one` or `key.other`. French uses the
 * singular for 0 and 1 ("0 carte", "1 carte", "2 cartes"); other languages will need
 * `Intl.PluralRules` when they arrive.
 */
export function countKey(key: string, count: number): string {
  return `${key}.${count < 2 ? 'one' : 'other'}`;
}
