import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, settle, textOf } from '../../../testing/dom';
import { AuthUser } from '../../core/auth/auth-api';
import { AuthStore } from '../../core/auth/auth-store';
import { Deck, DecksApi } from '../../core/decks/decks-api';
import { StudyApi, StudySummary } from '../../core/study/study-api';
import { Home } from './home';

describe('Home', () => {
  const user = signal<AuthUser | null>({ id: '1', username: 'chloe', email: 'chloe@example.be' });
  const list = vi.fn<() => Observable<Deck[]>>();
  const summary = vi.fn<() => Observable<StudySummary>>();
  const decks: Deck[] = [
    { id: 'd1', name: 'anglais', cardCount: 120, dueCount: 12, level: 3, published: false },
    { id: 'd2', name: 'Permis', cardCount: 8, dueCount: 1, level: 2, published: false },
    { id: 'd3', name: 'Histoire', cardCount: 4, dueCount: 0, level: 4, published: false },
    { id: 'd4', name: '🎵 Solfège', cardCount: 0, dueCount: 0, level: 0, published: false },
  ];
  let fixture: ComponentFixture<Home>;

  beforeEach(() => {
    list.mockReset().mockReturnValue(of(decks));
    summary.mockReset().mockReturnValue(of(summaryOf(12, 12)));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user } },
        { provide: DecksApi, useValue: { list } },
        { provide: StudyApi, useValue: { summary } },
      ],
    });
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function summaryOf(reviewedToday: number, dueCount: number, cards = 132): StudySummary {
    return { reviewedToday, dueCount, boxes: [cards, 0, 0, 0, 0] };
  }

  function rows(host: HTMLElement): HTMLAnchorElement[] {
    return [...host.querySelectorAll<HTMLAnchorElement>('.deck-row')];
  }

  it('should greet the signed-in user by their username', async () => {
    const host = await render();

    expect(textOf(host, 'header .subtitle')).toBe('Bonjour chloe');
    expect(textOf(host, 'h1')).toBe('Envie de réviser ?');
  });

  it('should list the decks once, each linking to its screen', async () => {
    const host = await render();

    expect(list).toHaveBeenCalledTimes(1);
    expect(textOf(host, '#home-decks-title')).toBe('Mes paquets');
    expect(rows(host).map((row) => row.getAttribute('href'))).toEqual([
      '/decks/d1',
      '/decks/d2',
      '/decks/d3',
      '/decks/d4',
    ]);
    expect(rows(host).map((row) => textOf(row, '.deck-row__name'))).toEqual([
      'anglais',
      'Permis',
      'Histoire',
      '🎵 Solfège',
    ]);
  });

  it('should say what each deck has to review today', async () => {
    const host = await render();

    expect(rows(host).map((row) => textOf(row, '.deck-row__status'))).toEqual([
      '12 cartes à réviser',
      '1 carte à réviser',
      "Rien à réviser aujourd'hui",
      'Aucune carte',
    ]);
  });

  it('should show each deck’s initial, colour and mastery', async () => {
    const host = await render();
    const [english, , history, music] = rows(host);

    expect(textOf(english, '.deck-row__tile')).toBe('A');
    expect(textOf(music, '.deck-row__tile')).toBe('🎵');
    expect(english.querySelectorAll('.box-meter__bar--filled')).toHaveLength(3);
    expect(textOf(history, '.visually-hidden')).toBe('Maîtrise 4 sur 5');
    const tones = rows(host).map((row) =>
      row.querySelector('.deck-row__tile')?.getAttribute('data-tone'),
    );
    expect(tones.every((tone) => ['violet', 'yellow', 'mint', 'coral'].includes(tone ?? ''))).toBe(
      true,
    );
  });

  it('should keep a deck’s colour whatever the other decks', async () => {
    const before = (await render()).querySelector('.deck-row__tile')?.getAttribute('data-tone');
    list.mockReturnValue(of([decks[0]]));

    const after = (await render()).querySelector('.deck-row__tile')?.getAttribute('data-tone');

    expect(after).toBe(before);
  });

  it('should offer to create another deck', async () => {
    const host = await render();

    expect(linkNamed(host, '+ Nouveau paquet').getAttribute('href')).toBe('/decks/new');
  });

  it('should invite a new learner to create a first deck', async () => {
    list.mockReturnValue(of([]));
    summary.mockReturnValue(of(summaryOf(0, 0, 0)));

    const host = await render();

    expect(textOf(host, 'h2')).toBe("Aucun paquet pour l'instant");
    expect(host.querySelector('.goal')).toBeNull();
    expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('sleepy');
    expect(linkNamed(host, 'Créer un paquet').getAttribute('href')).toBe('/decks/new');
    expect(rows(host)).toHaveLength(0);
  });

  it('should explain a loading failure and load again on demand', async () => {
    list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    const host = await render();
    expect(textOf(host, '[role="alert"] p')).toBe(
      'Impossible de charger tes paquets. Vérifie ta connexion.',
    );
    expect(rows(host)).toHaveLength(0);

    buttonNamed(host, 'Réessayer').click();
    await settle(fixture);

    expect(list).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(rows(host)).toHaveLength(4);
  });

  describe('daily goal', () => {
    it('should show today’s answers out of the goal, and continue the session', async () => {
      const host = await render();

      expect(summary).toHaveBeenCalledTimes(1);
      expect(textOf(host, '#goal-title')).toBe('Objectif du jour');
      expect(textOf(host, '.goal__progress')).toBe('12 sur 24 cartes révisées');
      expect(textOf(host, '.goal__ring')).toBe('12');
      expect(
        host.querySelector<HTMLElement>('.goal__ring')?.style.getPropertyValue('--goal-percent'),
      ).toBe('50');
      expect(linkNamed(host, 'Continuer la session').getAttribute('href')).toBe('/study/quiz');
      expect(linkNamed(host, "S'entraîner sans changer les boîtes").getAttribute('href')).toBe(
        '/study/practice',
      );
    });

    it('should start the session when nothing is answered yet', async () => {
      summary.mockReturnValue(of(summaryOf(0, 1)));

      const host = await render();

      expect(textOf(host, '.goal__progress')).toBe('0 sur 1 carte révisée');
      expect(linkNamed(host, 'Commencer la session').getAttribute('href')).toBe('/study/quiz');
    });

    it('should congratulate once everything due is answered', async () => {
      summary.mockReturnValue(of(summaryOf(5, 0)));

      const host = await render();

      expect(textOf(host, '.goal__rest')).toBe("Tout est révisé pour aujourd'hui. Bravo !");
      expect(host.querySelector('a[href="/study/quiz"]')).toBeNull();
      expect(host.querySelector('a[href="/study/practice"]')).not.toBeNull();
    });

    it('should say when nothing is due today', async () => {
      summary.mockReturnValue(of(summaryOf(0, 0)));

      const host = await render();

      expect(textOf(host, '.goal__rest')).toBe("Rien à réviser aujourd'hui. Reviens demain !");
      expect(host.querySelector('a[href="/study/quiz"]')).toBeNull();
    });

    it('should stay hidden when the summary cannot be loaded, leaving the decks', async () => {
      summary.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      const host = await render();

      expect(host.querySelector('.goal')).toBeNull();
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(rows(host)).toHaveLength(4);
    });
  });
});
