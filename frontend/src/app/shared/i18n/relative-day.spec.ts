import { relativeDay } from './relative-day';

describe('relativeDay', () => {
  // Local times: the function counts the device's calendar days.
  const now = new Date(2026, 10, 7, 9, 30);

  function daysBefore(days: number, hours = 9, minutes = 30): Date {
    return new Date(2026, 10, 7 - days, hours, minutes);
  }

  it.each([
    [daysBefore(0, 0, 1), 'aujourd’hui'],
    [daysBefore(1, 23, 59), 'hier'],
    [daysBefore(2), 'avant-hier'],
    [daysBefore(3), 'il y a 3 jours'],
    [daysBefore(6), 'il y a 6 jours'],
    [daysBefore(7), 'la semaine dernière'],
    [daysBefore(20), 'il y a 2 semaines'],
    [daysBefore(45), 'le mois dernier'],
    [daysBefore(200), 'il y a 6 mois'],
    [daysBefore(400), 'l’année dernière'],
    [daysBefore(1200), 'il y a 3 ans'],
  ])('should describe %s in calendar days, weeks, months or years', (date, expected) => {
    expect(relativeDay(date, now, 'fr')).toBe(expected);
  });

  it('should count yesterday evening as yesterday, even an hour ago', () => {
    const justAfterMidnight = new Date(2026, 10, 7, 0, 30);

    expect(relativeDay(new Date(2026, 10, 6, 23, 30), justAfterMidnight, 'fr')).toBe('hier');
  });

  it('should read a date in the future as today', () => {
    expect(relativeDay(new Date(2026, 10, 9), now, 'fr')).toBe('aujourd’hui');
  });

  it('should follow the language given', () => {
    expect(relativeDay(daysBefore(3), now, 'en')).toBe('3 days ago');
  });
});
