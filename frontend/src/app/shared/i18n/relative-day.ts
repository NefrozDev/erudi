const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long ago a date was, counted in the device's calendar days: "aujourd’hui", "hier",
 * "il y a 3 jours", then in weeks, months and years. A date in the future (a clock ahead of
 * the device's) reads as today.
 */
export function relativeDay(date: Date, now: Date, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  // Rounded: a day with a daylight saving change lasts 23 or 25 hours.
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS));

  if (days < 7) {
    return format.format(-days, 'day');
  }
  if (days < 30) {
    return format.format(-Math.floor(days / 7), 'week');
  }
  if (days < 365) {
    return format.format(-Math.floor(days / 30), 'month');
  }
  return format.format(-Math.floor(days / 365), 'year');
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
