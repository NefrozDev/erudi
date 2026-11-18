import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, settle, textOf } from '../../../testing/dom';
import { DayActivity, StudyApi, StudyStats, StudySummary } from '../../core/study/study-api';
import { Progress } from './progress';

describe('Progress', () => {
  const summary = vi.fn<() => Observable<StudySummary>>();
  const stats = vi.fn<() => Observable<StudyStats>>();
  /** 14 days ending on Wednesday 18 November 2026: nothing, except where given. */
  const lastDays = (counts: Record<number, [number, number]> = {}): DayActivity[] =>
    Array.from({ length: 14 }, (_, i) => {
      const day = `2026-11-${String(5 + i).padStart(2, '0')}`;
      const [reviews, known] = counts[i] ?? [0, 0];
      return { day, reviews, known };
    });
  const figures = (overrides: Partial<StudyStats> = {}): StudyStats => ({
    currentStreak: 3,
    bestStreak: 5,
    studiedToday: true,
    studyDays: 12,
    totalReviews: 2300,
    successRate: 73,
    cardCount: 77,
    masteredCount: 18,
    lastDays: lastDays({ 11: [2, 1], 12: [8, 6], 13: [4, 4] }),
    secondsPerCard: 9,
    ...overrides,
  });
  let fixture: ComponentFixture<Progress>;

  beforeEach(() => {
    summary.mockReset().mockReturnValue(
      of({
        reviewedToday: 2,
        dueCount: 5,
        boxes: [30, 28, 1, 0, 18],
        secondsPerCard: 9,
        currentStreak: 3,
      }),
    );
    stats.mockReset().mockReturnValue(of(figures()));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: StudyApi, useValue: { summary, stats } }],
    });
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(Progress);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function rows(host: HTMLElement): string[][] {
    return [...host.querySelectorAll('.progress__box')].map((box) => [
      textOf(box, '.progress__box-name'),
      textOf(box, '.progress__box-interval'),
      textOf(box, '.progress__count').replace(/\s+/g, ' '),
    ]);
  }

  function tiles(host: HTMLElement): string[][] {
    return [...host.querySelectorAll('.progress__tile')].map((tile) => [
      textOf(tile, 'dt'),
      textOf(tile, 'dd'),
    ]);
  }

  it('should load the summary and the statistics once', async () => {
    await render();

    expect(summary).toHaveBeenCalledTimes(1);
    expect(stats).toHaveBeenCalledTimes(1);
  });

  describe('streak', () => {
    it('should show the streak, the record and praise a day already done', async () => {
      const host = await render();

      expect(textOf(host, '#progress-streak-title')).toBe("3 jours d'affilée");
      expect(textOf(host, '.progress__streak')).toContain(
        "Ta série continue : bravo pour aujourd'hui !",
      );
      expect(textOf(host, '.progress__streak-best')).toBe('Record : 5 jours');
    });

    it('should urge the learner to keep a streak that today has not extended yet', async () => {
      stats.mockReturnValue(of(figures({ currentStreak: 1, bestStreak: 1, studiedToday: false })));

      const host = await render();

      expect(textOf(host, '#progress-streak-title')).toBe("1 jour d'affilée");
      expect(textOf(host, '.progress__streak')).toContain(
        "Révise aujourd'hui pour garder ta série !",
      );
      expect(textOf(host, '.progress__streak-best')).toBe('Record : 1 jour');
    });

    it('should invite a learner without a streak to start one, without a record', async () => {
      stats.mockReturnValue(of(figures({ currentStreak: 0, bestStreak: 0, studiedToday: false })));

      const host = await render();

      expect(textOf(host, '#progress-streak-title')).toBe("0 jour d'affilée");
      expect(textOf(host, '.progress__streak')).toContain('pour lancer ta série');
      expect(host.querySelector('.progress__streak-best')).toBeNull();
    });
  });

  it('should show the account’s totals, numbers in French format', async () => {
    const host = await render();

    expect(tiles(host)).toEqual([
      ['Réponses en révision', '2 300'.replace(' ', ' ')],
      ['Réussite sur 30 jours', '73 %'],
      ['Cartes maîtrisées', '18 sur 77'],
      ['Jours de révision', '12'],
    ]);
  });

  it('should say there is no success rate before any answer', async () => {
    stats.mockReturnValue(of(figures({ successRate: null })));

    const host = await render();

    expect(tiles(host)[1]).toEqual(['Réussite sur 30 jours', 'Pas encore']);
  });

  describe('last 14 days', () => {
    it('should draw a bar per day, the busiest full height, with its known share', async () => {
      const host = await render();
      const bars = [...host.querySelectorAll<HTMLElement>('.progress__day-fill')];
      const known = [...host.querySelectorAll<HTMLElement>('.progress__day-known')];

      expect(bars).toHaveLength(14);
      expect(bars.slice(-3).map((bar) => bar.style.height)).toEqual(['25%', '100%', '50%']);
      expect(known.slice(-3).map((bar) => bar.style.height)).toEqual(['50%', '75%', '100%']);
      expect(bars[0].style.height).toBe('0%');
      expect(textOf(host, '.progress__section .subtitle')).toBe('14 réponses ces 7 derniers jours');
    });

    it('should tell screen readers each day in words, hiding the bars', async () => {
      const host = await render();
      const days = [...host.querySelectorAll('.progress__day')];

      expect(textOf(days[13], '.visually-hidden').replace(/\s+/g, ' ')).toBe(
        'mercredi 18 novembre : 4 réponses, dont 4 bonnes',
      );
      expect(textOf(days[0], '.visually-hidden').replace(/\s+/g, ' ')).toBe(
        'jeudi 5 novembre : 0 réponse, dont 0 bonne',
      );
      expect(days[13].querySelector('.progress__day-bar')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
      expect(textOf(days[13], '.progress__day-initial')).toBe('M');
    });

    it('should keep empty bars at zero height without dividing by zero', async () => {
      stats.mockReturnValue(of(figures({ lastDays: lastDays() })));

      const host = await render();

      const heights = [...host.querySelectorAll<HTMLElement>('.progress__day-fill')].map(
        (bar) => bar.style.height,
      );
      expect(new Set(heights)).toEqual(new Set(['0%']));
      expect(textOf(host, '.progress__section .subtitle')).toBe('0 réponse ces 7 derniers jours');
    });
  });

  describe('boxes', () => {
    it('should show each box, how often it comes back and its cards (screen 13)', async () => {
      const host = await render();

      expect(textOf(host, '#progress-boxes-title')).toBe('Tes boîtes');
      expect(textOf(host, '[aria-labelledby="progress-boxes-title"] .subtitle')).toBe(
        '77 cartes réparties dans 5 boîtes',
      );
      expect(rows(host)).toEqual([
        ['Boîte 1', 'Chaque jour', '30 cartes'],
        ['Boîte 2', 'Tous les 2 jours', '28 cartes'],
        ['Boîte 3', 'Tous les 4 jours', '1 carte'],
        ['Boîte 4', 'Chaque semaine', '0 carte'],
        ['Boîte 5', 'Toutes les 2 semaines', '18 cartes'],
      ]);
    });

    it('should only show the number, the word being for screen readers', async () => {
      const host = await render();
      const count = host.querySelector('.progress__count');

      expect(count?.firstChild?.textContent?.trim()).toBe('30');
      expect(count?.querySelector('.visually-hidden')?.textContent?.trim()).toBe('cartes');
    });

    it('should offer to practise each box holding cards, on all its cards', async () => {
      const host = await render();
      const links = [...host.querySelectorAll<HTMLAnchorElement>('.progress__practice')];

      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/study/practice?box=1&count=all',
        '/study/practice?box=2&count=all',
        '/study/practice?box=3&count=all',
        '/study/practice?box=5&count=all',
      ]);
      expect(links[0].textContent?.replace(/\s+/g, ' ').trim()).toBe("S'entraîner sur la boîte 1");
    });

    it('should use the singular for a single card', async () => {
      summary.mockReturnValue(
        of({
          reviewedToday: 0,
          dueCount: 1,
          boxes: [1, 0, 0, 0, 0],
          secondsPerCard: 10,
          currentStreak: 0,
        }),
      );

      const host = await render();

      expect(textOf(host, '[aria-labelledby="progress-boxes-title"] .subtitle')).toBe(
        '1 carte répartie dans 5 boîtes',
      );
    });

    it('should load the boxes again after a failure, leaving the statistics', async () => {
      summary.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

      const host = await render();
      expect(textOf(host, '[role="alert"] p')).toBe(
        'Impossible de charger cette page. Vérifie ta connexion.',
      );
      expect(host.querySelector('.progress__streak')).not.toBeNull();

      buttonNamed(host, 'Réessayer').click();
      await settle(fixture);

      expect(summary).toHaveBeenCalledTimes(2);
      expect(stats).toHaveBeenCalledTimes(1);
      expect(rows(host)).toHaveLength(5);
    });
  });

  describe('badges', () => {
    function badges(host: HTMLElement): string[][] {
      return [...host.querySelectorAll('.badge')].map((badge) => [
        textOf(badge, '.badge__title'),
        textOf(badge, '.badge__status'),
        badge.classList.contains('badge--earned') ? 'earned' : '',
      ]);
    }

    it('should show the badges earned and how far the others are', async () => {
      const host = await render();

      expect(textOf(host, '#progress-badges-title')).toBe('Badges');
      expect(textOf(host, '[aria-labelledby="progress-badges-title"] .subtitle')).toBe(
        '5 sur 8 obtenus',
      );
      expect(badges(host)).toEqual([
        ['Premier pas', 'Obtenu', 'earned'],
        ['Sur la lancée', 'Obtenu', 'earned'],
        ['Une semaine pile', '5 / 7', ''],
        ['Inarrêtable', '5 / 30', ''],
        ['Centurion', 'Obtenu', 'earned'],
        ['Mille bravos', 'Obtenu', 'earned'],
        ['Habitué', 'Obtenu', 'earned'],
        ['Fidèle', '12 / 50', ''],
      ]);
    });

    it('should show none earned for a new learner', async () => {
      stats.mockReturnValue(
        of(figures({ totalReviews: 0, bestStreak: 0, currentStreak: 0, studyDays: 0 })),
      );

      const host = await render();

      expect(host.querySelectorAll('.badge--earned')).toHaveLength(0);
      expect(badges(host)[0]).toEqual(['Premier pas', '0 / 1', '']);
    });
  });

  it('should explain a statistics failure and load them again on demand', async () => {
    stats.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

    const host = await render();
    expect(host.querySelector('.progress__streak')).toBeNull();
    expect(host.querySelector('.badge')).toBeNull();
    expect(rows(host)).toHaveLength(5);

    buttonNamed(host, 'Réessayer').click();
    await settle(fixture);

    expect(stats).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.progress__streak')).not.toBeNull();
  });
});
