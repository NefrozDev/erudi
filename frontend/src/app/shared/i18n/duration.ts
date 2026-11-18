import { countKey } from './count-key';

/** A translation key and its parameters. */
export interface Duration {
  key: string;
  params: Record<string, string | number>;
}

/**
 * How long a session of `cards` cards takes at the learner's pace, rounded to the minute:
 * "moins d'une minute", "environ 4 min", "environ 1 h 05".
 */
export function sessionDuration(cards: number, secondsPerCard: number): Duration {
  const seconds = cards * secondsPerCard;
  if (seconds < 60) {
    return { key: 'common.duration.underAMinute', params: {} };
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return { key: countKey('common.duration.minutes', minutes), params: { minutes } };
  }
  return {
    key: 'common.duration.hours',
    params: { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') },
  };
}
