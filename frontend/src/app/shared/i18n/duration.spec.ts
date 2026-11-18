import { sessionDuration } from './duration';

describe('sessionDuration', () => {
  it.each([
    [0, 10, 'common.duration.underAMinute', {}],
    [5, 10, 'common.duration.underAMinute', {}],
    [6, 10, 'common.duration.minutes.one', { minutes: 1 }],
    [12, 10, 'common.duration.minutes.other', { minutes: 2 }],
    // 4 min 30 s rounds up, 4 min 20 s down.
    [27, 10, 'common.duration.minutes.other', { minutes: 5 }],
    [26, 10, 'common.duration.minutes.other', { minutes: 4 }],
    // 59 min 50 s is an hour once rounded.
    [359, 10, 'common.duration.hours', { hours: 1, minutes: '00' }],
    [354, 10, 'common.duration.minutes.other', { minutes: 59 }],
    [390, 10, 'common.duration.hours', { hours: 1, minutes: '05' }],
    [2000, 10, 'common.duration.hours', { hours: 5, minutes: '33' }],
  ])('should say %i cards at %is each take %s %o', (cards, seconds, key, params) => {
    expect(sessionDuration(cards, seconds)).toEqual({ key, params });
  });
});
