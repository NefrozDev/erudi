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
  const user = signal<AuthUser | null>({
    id: '1',
    username: 'chloe',
    email: 'chloe@example.be',
    termsAccepted: true,
  });
  const list = vi.fn<() => Observable<Deck[]>>();
  const summary = vi.fn<() => Observable<StudySummary>>();
  const deleteDeck = vi.fn<(deckId: string) => Observable<void>>();
  const decks: Deck[] = [
    { id: 'd1', name: 'anglais', cardCount: 120, dueCount: 12, level: 3, published: false, masteredCount: 0 },
    { id: 'd2', name: 'Permis', cardCount: 8, dueCount: 1, level: 2, published: false, masteredCount: 0 },
    { id: 'd3', name: 'Histoire', cardCount: 4, dueCount: 0, level: 4, published: false, masteredCount: 0 },
    { id: 'd4', name: '🎵 Solfège', cardCount: 0, dueCount: 0, level: 0, published: false, masteredCount: 0 },
  ];
  let fixture: ComponentFixture<Home>;

  beforeEach(() => {
    list.mockReset().mockReturnValue(of(decks));
    summary.mockReset().mockReturnValue(of(summaryOf(12, 12)));
    deleteDeck.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user } },
        { provide: DecksApi, useValue: { list, delete: deleteDeck } },
        { provide: StudyApi, useValue: { summary } },
      ],
    });
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function summaryOf(
    reviewedToday: number,
    dueCount: number,
    cards = 132,
    currentStreak = 0,
  ): StudySummary {
    return { reviewedToday, dueCount, boxes: [cards, 0, 0, 0, 0], secondsPerCard: 10, currentStreak };
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
    expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('magician');
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

    it('should estimate the time the due cards still take', async () => {
      const host = await render();

      // 12 cards at 10 seconds each.
      expect([...host.querySelectorAll('.goal__progress')].map((p) => p.textContent?.trim())).toEqual([
        '12 sur 24 cartes révisées',
        'Encore environ 2 minutes',
      ]);
    });

    it('should show the streak, leading to the progress screen', async () => {
      summary.mockReturnValue(of(summaryOf(12, 12, 132, 4)));

      const host = await render();

      const streak = linkNamed(host, "4 jours d'affilée");
      expect(streak.getAttribute('href')).toBe('/progress');
      expect(streak.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('should leave out a streak of zero', async () => {
      const host = await render();

      expect(host.querySelector('.goal__streak')).toBeNull();
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
      expect(host.textContent).not.toContain('Encore');
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

  describe('managing decks', () => {
    async function manage(): Promise<HTMLElement> {
      const host = await render();
      buttonNamed(host, 'Gérer').click();
      await settle(fixture);
      return host;
    }

    async function confirmDeletion(host: HTMLElement, name: string): Promise<void> {
      buttonNamed(host, `Supprimer « ${name} »`).click();
      await settle(fixture);
      buttonNamed(host, 'Supprimer définitivement').click();
      await settle(fixture);
    }

    it('should hide the delete buttons until the learner manages the decks', async () => {
      const host = await render();

      expect(host.querySelector('app-delete-confirmation')).toBeNull();

      buttonNamed(host, 'Gérer').click();
      await settle(fixture);
      expect(host.querySelectorAll('app-delete-confirmation')).toHaveLength(4);
      expect(buttonNamed(host, 'Supprimer « Permis »')).toBeTruthy();

      buttonNamed(host, 'Terminé').click();
      await settle(fixture);
      expect(host.querySelector('app-delete-confirmation')).toBeNull();
    });

    it('should ask before deleting and keep the deck on second thought', async () => {
      const host = await manage();

      buttonNamed(host, 'Supprimer « Permis »').click();
      await settle(fixture);
      expect(textOf(host, 'app-delete-confirmation [role="alert"]')).toBe(
        "Supprimer « Permis » et ses cartes ? C'est définitif.",
      );
      buttonNamed(host, 'Garder le paquet').click();
      await settle(fixture);

      expect(deleteDeck).not.toHaveBeenCalled();
    });

    it('should delete the deck, then refresh the decks and the goal and say so', async () => {
      const host = await manage();
      list.mockReturnValue(of(decks.filter((deck) => deck.id !== 'd2')));

      await confirmDeletion(host, 'Permis');

      expect(deleteDeck).toHaveBeenCalledExactlyOnceWith('d2');
      expect(list).toHaveBeenCalledTimes(2);
      expect(summary).toHaveBeenCalledTimes(2);
      expect(rows(host).map((row) => textOf(row, '.deck-row__name'))).not.toContain('Permis');
      expect(textOf(host, '[role="status"]')).toBe('« Permis » a été supprimé.');
      expect(document.activeElement).toBe(buttonNamed(host, 'Terminé'));
    });

    it('should treat a deck deleted on another device as deleted', async () => {
      deleteDeck.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      const host = await manage();

      await confirmDeletion(host, 'Permis');

      expect(list).toHaveBeenCalledTimes(2);
      expect(host.querySelector('p.alert')).toBeNull();
    });

    it('should say when the deletion fails and keep the list as it was', async () => {
      deleteDeck.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const host = await manage();

      await confirmDeletion(host, 'Permis');

      expect(textOf(host, 'p.alert')).toBe("L'enregistrement a échoué. Réessaie dans un instant.");
      expect(list).toHaveBeenCalledTimes(1);
      expect(summary).toHaveBeenCalledTimes(1);
      expect(rows(host)).toHaveLength(4);
      expect(textOf(host, '[role="status"]')).toBe('');
    });
  });
});
