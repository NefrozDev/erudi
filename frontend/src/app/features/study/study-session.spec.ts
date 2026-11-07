import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf } from '../../../testing/dom';
import { ExploreApi, TestCard, TestResult } from '../../core/explore/explore-api';
import { AnswerResult, StudyApi, StudyCard } from '../../core/study/study-api';
import { SessionMode, StudySession } from './study-session';

describe('StudySession', () => {
  const cards: StudyCard[] = [
    {
      id: 'c1',
      deckId: 'd1',
      deckName: 'Anglais',
      front: 'to run out of',
      back: 'manquer de',
      box: 2,
    },
    {
      id: 'c2',
      deckId: 'd1',
      deckName: 'Anglais',
      front: 'a deadline',
      back: 'une échéance',
      box: 1,
    },
    {
      id: 'c3',
      deckId: 'd2',
      deckName: 'Histoire',
      front: '1830',
      back: 'Indépendance\nde la Belgique',
      box: 4,
    },
  ];
  const testCards: TestCard[] = [
    { id: 't1', deckName: 'Capitales', front: 'Belgique', back: 'Bruxelles' },
    { id: 't2', deckName: 'Capitales', front: 'Pérou', back: 'Lima' },
    { id: 't3', deckName: 'Capitales', front: 'Canada', back: 'Ottawa' },
  ];
  const api = {
    cards: vi.fn<(mode: 'quiz' | 'practice', deckId?: string) => Observable<StudyCard[]>>(),
    answer: vi.fn<(cardId: string, knew: boolean) => Observable<AnswerResult>>(),
  };
  const exploreApi = {
    testCards: vi.fn<(deckId: string) => Observable<TestCard[]>>(),
    saveResult: vi.fn<(deckId: string, known: number, total: number) => Observable<TestResult>>(),
  };
  let fixture: ComponentFixture<StudySession>;
  let host: HTMLElement;

  beforeEach(() => {
    api.cards.mockReset().mockReturnValue(of(cards));
    api.answer.mockReset().mockReturnValue(of({ box: 3, dueOn: '2026-11-11' }));
    exploreApi.testCards.mockReset().mockReturnValue(of(testCards));
    exploreApi.saveResult.mockReset().mockReturnValue(of({ score: 67, bestScore: 67 }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: StudyApi, useValue: api },
        { provide: ExploreApi, useValue: exploreApi },
      ],
    });
  });

  async function render(mode: SessionMode, deckId?: string): Promise<void> {
    fixture = TestBed.createComponent(StudySession);
    fixture.componentRef.setInput('mode', mode);
    if (deckId !== undefined) {
      fixture.componentRef.setInput('deckId', deckId);
    }
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  async function click(button: HTMLElement): Promise<void> {
    button.click();
    await settle(fixture);
  }

  async function flipAndAnswer(answer: 'Je savais' | 'Je ne savais pas'): Promise<void> {
    await click(buttonNamed(host, 'Retourner la carte'));
    await click(buttonNamed(host, answer));
  }

  function cardText(): string {
    return textOf(host, '.flashcard__text');
  }

  describe('a quiz over every deck', () => {
    beforeEach(() => render('quiz'));

    it('should load the due cards of every deck once', () => {
      expect(api.cards).toHaveBeenCalledExactlyOnceWith('quiz', undefined);
    });

    it('should show the first question with its deck and box (screen 10)', () => {
      expect(cardText()).toBe('to run out of');
      expect(textOf(host, '.flashcard__deck')).toBe('Anglais');
      expect(textOf(host, '.flashcard__chip')).toMatch(/Boîte 2$/);
      expect(host.querySelectorAll('.flashcard__chip .box-meter__bar--filled')).toHaveLength(2);
      expect(textOf(host, '.flashcard__hint')).toBe('Touche pour retourner');
      expect(textOf(host, '.study__count')).toBe('1/3');
      const progress = query(host, '[role="progressbar"]');
      expect(progress.getAttribute('aria-valuenow')).toBe('0');
      expect(progress.getAttribute('aria-valuetext')).toBe('Carte 1 sur 3');
      expect(host.textContent).not.toContain('manquer de');
    });

    it('should turn the card over, from the button or the card itself (screen 11)', async () => {
      await click(query(host, 'button.flashcard'));

      expect(cardText()).toBe('manquer de');
      expect(textOf(host, '.flashcard__hint')).toBe('to run out of');
      expect(buttonNamed(host, 'Je savais')).toBeTruthy();
      expect(buttonNamed(host, 'Je ne savais pas')).toBeTruthy();
      expect(document.activeElement).toBe(query(host, '.flashcard--back'));
      expect(api.answer).not.toHaveBeenCalled();
    });

    it('should save each answer, then show the next question', async () => {
      await flipAndAnswer('Je savais');

      expect(api.answer).toHaveBeenCalledExactlyOnceWith('c1', true);
      expect(cardText()).toBe('a deadline');
      expect(textOf(host, '.study__count')).toBe('2/3');
      expect(document.activeElement).toBe(query(host, 'button.flashcard'));

      await flipAndAnswer('Je ne savais pas');

      expect(api.answer).toHaveBeenLastCalledWith('c2', false);
      expect(api.answer).toHaveBeenCalledTimes(2);
    });

    it('should keep line breaks of multi-line answers', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');
      await click(buttonNamed(host, 'Retourner la carte'));

      expect(query(host, '.flashcard__text').textContent).toContain('Indépendance\nde la Belgique');
    });

    it('should end with the results and a way home (screen 12)', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je savais');

      expect(textOf(host, 'h1')).toBe('Bravo !');
      expect(textOf(host, '.study__end-text')).toBe('Session terminée');
      const stats = [...host.querySelectorAll('.study__stat')].map((stat) => [
        textOf(stat, 'dd'),
        textOf(stat, 'dt'),
      ]);
      expect(stats).toEqual([
        ['2', 'cartes montent'],
        ['1', 'à revoir'],
      ]);
      expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('proud');
      expect(linkNamed(host, 'Terminer').getAttribute('href')).toBe('/');
      expect(document.activeElement).toBe(query(host, 'h1'));
      expect(api.answer).toHaveBeenCalledTimes(3);
    });

    it('should not answer twice while an answer is being saved', async () => {
      const pending = new Subject<AnswerResult>();
      api.answer.mockReturnValueOnce(pending);

      await click(buttonNamed(host, 'Retourner la carte'));
      buttonNamed(host, 'Je savais').click();
      await settle(fixture);

      expect(buttonNamed(host, 'Je savais').disabled).toBe(true);
      expect(buttonNamed(host, 'Je ne savais pas').disabled).toBe(true);
      buttonNamed(host, 'Je ne savais pas').click();
      expect(api.answer).toHaveBeenCalledTimes(1);

      pending.next({ box: 3, dueOn: '2026-11-11' });
      pending.complete();
      await settle(fixture);
      expect(cardText()).toBe('a deadline');
    });

    it('should keep the card when an answer is not saved, and allow trying again', async () => {
      api.answer.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

      await flipAndAnswer('Je savais');

      expect(textOf(host, '[role="alert"]')).toBe("Ta réponse n'a pas été enregistrée. Réessaie.");
      expect(cardText()).toBe('manquer de');
      expect(buttonNamed(host, 'Je savais').disabled).toBe(false);

      await click(buttonNamed(host, 'Je savais'));

      expect(api.answer).toHaveBeenCalledTimes(2);
      expect(cardText()).toBe('a deadline');
      expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it('should move on when another tab already answered the card', async () => {
      api.answer.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));

      await flipAndAnswer('Je savais');

      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(cardText()).toBe('a deadline');
    });

    it('should offer to leave at any time', () => {
      const close = query(host, 'a.study__close');
      expect(close.getAttribute('aria-label')).toBe('Quitter la session');
      expect(close.getAttribute('href')).toBe('/');
    });
  });

  describe('a quiz over one deck', () => {
    it("should load that deck's cards, hide the deck's name and lead back to it", async () => {
      await render('quiz', 'd1');

      expect(api.cards).toHaveBeenCalledExactlyOnceWith('quiz', 'd1');
      expect(textOf(host, '.flashcard__chip')).toBe('Boîte 2');
      expect(host.querySelector('.study__close')?.getAttribute('href')).toBe('/decks/d1');
    });

    it('should suggest practice when nothing is due', async () => {
      api.cards.mockReturnValue(of([]));

      await render('quiz', 'd1');

      expect(textOf(host, 'h1')).toBe("Rien à réviser pour l'instant");
      expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('sleepy');
      expect(linkNamed(host, "S'entraîner").getAttribute('href')).toBe('/study/practice?deckId=d1');
      expect(linkNamed(host, 'Retour').getAttribute('href')).toBe('/decks/d1');
    });

    it('should say when the deck does not exist', async () => {
      api.cards.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

      await render('quiz', 'missing');

      expect(textOf(host, 'h1')).toBe('Paquet introuvable');
      expect(linkNamed(host, 'Retour').getAttribute('href')).toBe('/');
    });

    it('should load again after a failure', async () => {
      api.cards.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

      await render('quiz', 'd1');
      expect(textOf(host, '[role="alert"] p')).toBe(
        'Impossible de charger cette page. Vérifie ta connexion.',
      );

      await click(buttonNamed(host, 'Réessayer'));

      expect(api.cards).toHaveBeenCalledTimes(2);
      expect(cardText()).toBe('to run out of');
    });
  });

  describe('practice', () => {
    beforeEach(() => render('practice', 'd1'));

    it('should ask random cards and send no answer', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');

      expect(api.cards).toHaveBeenCalledExactlyOnceWith('practice', 'd1');
      expect(api.answer).not.toHaveBeenCalled();
    });

    it('should end with the score, saying the boxes did not change', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je ne savais pas');

      const texts = [...host.querySelectorAll('.study__end-text')].map((p) =>
        p.textContent?.trim(),
      );
      expect(texts).toEqual(['Entraînement terminé', "Les cartes n'ont pas changé de boîte."]);
      expect(textOf(host, '.study__stat dt')).toBe('bonne réponse');
      expect(textOf(host, '.study__stat dd')).toBe('1');
      expect(linkNamed(host, 'Terminer').getAttribute('href')).toBe('/decks/d1');
    });
  });

  describe('a test of a public deck', () => {
    function stats(): string[][] {
      return [...host.querySelectorAll('.study__stat')].map((stat) => [
        textOf(stat, 'dd'),
        textOf(stat, 'dt'),
      ]);
    }

    async function answerAll(): Promise<void> {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je savais');
    }

    it("should ask the deck's cards with its name, without any box", async () => {
      await render('test', 'p1');

      expect(exploreApi.testCards).toHaveBeenCalledExactlyOnceWith('p1');
      expect(api.cards).not.toHaveBeenCalled();
      expect(cardText()).toBe('Belgique');
      expect(textOf(host, '.flashcard__chip')).toBe('Capitales');
      expect(host.querySelector('.flashcard__chip app-box-meter')).toBeNull();
      expect(query(host, 'a.study__close').getAttribute('href')).toBe('/explore/p1');
    });

    it('should send no answer, then save the score once, at the end', async () => {
      await render('test', 'p1');

      await answerAll();

      expect(api.answer).not.toHaveBeenCalled();
      expect(exploreApi.saveResult).toHaveBeenCalledExactlyOnceWith('p1', 2, 3);
      expect(textOf(host, 'h1').replace(/\s+/g, ' ')).toBe('Score : 67 %');
      expect(textOf(host, '.study__end-text')).toBe('Test terminé');
      expect(stats()).toEqual([
        ['2', 'bonnes réponses'],
        ['1', 'à revoir'],
      ]);
      expect(textOf(host, '.study__best')).toBe("C'est ton meilleur score !");
      expect(linkNamed(host, 'Terminer').getAttribute('href')).toBe('/explore/p1');
      expect(document.activeElement).toBe(query(host, 'h1'));
    });

    it('should recall a better score from an earlier test', async () => {
      exploreApi.saveResult.mockReturnValue(of({ score: 67, bestScore: 80 }));
      await render('test', 'p1');

      await answerAll();

      expect(textOf(host, '.study__best')).toBe('Ton meilleur score : 80 %');
    });

    it('should keep the score when it is not saved, and allow trying again', async () => {
      exploreApi.saveResult.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );
      await render('test', 'p1');

      await answerAll();

      expect(textOf(host, 'h1').replace(/\s+/g, ' ')).toBe('Score : 67 %');
      expect(textOf(host, '[role="alert"] p')).toBe("Ton score n'a pas été enregistré.");
      expect(host.querySelector('.study__best')).toBeNull();

      await click(buttonNamed(host, 'Réessayer'));

      expect(exploreApi.saveResult).toHaveBeenCalledTimes(2);
      expect(exploreApi.saveResult).toHaveBeenLastCalledWith('p1', 2, 3);
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(textOf(host, '.study__best')).toBe("C'est ton meilleur score !");
    });

    it('should say when the deck has no card left', async () => {
      exploreApi.testCards.mockReturnValue(of([]));

      await render('test', 'p1');

      expect(textOf(host, 'h1')).toBe('Ce paquet est vide');
      expect(host.querySelector('a[href^="/study/practice"]')).toBeNull();
      expect(linkNamed(host, 'Retour').getAttribute('href')).toBe('/explore/p1');
      expect(exploreApi.saveResult).not.toHaveBeenCalled();
    });

    it('should say when the deck is no longer published', async () => {
      exploreApi.testCards.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404 })),
      );

      await render('test', 'p1');

      expect(textOf(host, 'h1')).toBe('Paquet introuvable');
      expect(textOf(host, '.study__end-text')).toBe("Ce paquet n'est plus publié.");
      expect(linkNamed(host, 'Retour').getAttribute('href')).toBe('/explore');
    });
  });

  it('should explain that practice needs cards first', async () => {
    api.cards.mockReturnValue(of([]));

    await render('practice');

    expect(textOf(host, 'h1')).toBe("Aucune carte pour s'entraîner");
    expect(host.querySelector('a[href^="/study/practice"]')).toBeNull();
    expect(linkNamed(host, 'Retour').getAttribute('href')).toBe('/');
  });
});
