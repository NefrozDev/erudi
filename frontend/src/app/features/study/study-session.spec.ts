import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf } from '../../../testing/dom';
import { ExploreApi, TestCard, TestResult } from '../../core/explore/explore-api';
import { SoundEffects } from '../../core/sound/sound-effects';
import { Card, CardContent, DecksApi } from '../../core/decks/decks-api';
import { AnswerResult, StudyApi, StudyCard, StudyFilter } from '../../core/study/study-api';
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
    cards: vi.fn<(mode: 'quiz' | 'practice', filter?: StudyFilter) => Observable<StudyCard[]>>(),
    answer: vi.fn<(cardId: string, knew: boolean) => Observable<AnswerResult>>(),
  };
  const exploreApi = {
    testCards: vi.fn<(deckId: string) => Observable<TestCard[]>>(),
    saveResult: vi.fn<(deckId: string, known: number, total: number) => Observable<TestResult>>(),
  };
  const sounds = { play: vi.fn<(sound: 'knew' | 'again') => void>() };
  const decksApi = {
    updateCard: vi.fn<(cardId: string, content: CardContent) => Observable<Card>>(),
  };
  let fixture: ComponentFixture<StudySession>;
  let host: HTMLElement;
  let random: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Just under 1: shuffling keeps the order and "mixed" asks the front, unless a test says.
    random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    sounds.play.mockReset();
    api.cards.mockReset().mockReturnValue(of(cards));
    api.answer.mockReset().mockReturnValue(of({ box: 3, dueOn: '2026-11-11' }));
    exploreApi.testCards.mockReset().mockReturnValue(of(testCards));
    decksApi.updateCard
      .mockReset()
      .mockImplementation((cardId, content) =>
        of({ id: cardId, deckId: 'd1', box: 2, ...content }),
      );
    // jsdom has no modal dialogs: open and close them as the browser would.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    });
    exploreApi.saveResult.mockReset().mockReturnValue(of({ score: 67, bestScore: 67 }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: StudyApi, useValue: api },
        { provide: ExploreApi, useValue: exploreApi },
        { provide: SoundEffects, useValue: sounds },
        { provide: DecksApi, useValue: decksApi },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  async function render(mode: SessionMode, deckId?: string, direction?: string): Promise<void> {
    fixture = TestBed.createComponent(StudySession);
    fixture.componentRef.setInput('mode', mode);
    if (direction !== undefined) {
      fixture.componentRef.setInput('direction', direction);
    }
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

  describe('the order and side of the cards', () => {
    it('should shuffle the quiz cards', async () => {
      random.mockReturnValue(0);

      await render('quiz');

      // Each card swapped with the first one: c1, c2, c3 become c2, c3, c1.
      expect(cardText()).toBe('a deadline');
    });

    it('should keep the order of practice cards, already random', async () => {
      random.mockReturnValue(0);

      await render('practice');

      expect(cardText()).toBe('to run out of');
    });

    it('should ask the back and answer with the front when asked from the back', async () => {
      await render('quiz', undefined, 'back');

      expect(cardText()).toBe('manquer de');
      await click(buttonNamed(host, 'Retourner la carte'));
      expect(cardText()).toBe('to run out of');
      expect(textOf(host, '.flashcard__hint')).toBe('manquer de');
    });

    it('should pick a side per card when mixed', async () => {
      // Shuffling draws first (2 numbers), then one per card: front, back, front.
      random
        .mockReturnValueOnce(0.999)
        .mockReturnValueOnce(0.999)
        .mockReturnValueOnce(0.7)
        .mockReturnValueOnce(0.2)
        .mockReturnValueOnce(0.7);

      await render('quiz', undefined, 'mixed');

      expect(cardText()).toBe('to run out of');
      await flipAndAnswer('Je savais');
      expect(cardText()).toBe('une échéance');
      await flipAndAnswer('Je savais');
      expect(cardText()).toBe('1830');
    });

    it('should ask the front for an unknown direction', async () => {
      await render('practice', undefined, 'sideways');

      expect(cardText()).toBe('to run out of');
    });
  });

  describe('a quiz of 50 cards', () => {
    const many = (prefix: string): StudyCard[] =>
      Array.from({ length: 50 }, (_, i) => ({
        ...cards[0],
        id: `${prefix}${i}`,
        front: `${prefix}${i}`,
      }));

    it('should offer the next due cards, then start over from the first one', async () => {
      api.cards.mockReturnValueOnce(of(many('a'))).mockReturnValueOnce(of(many('b')));
      await render('quiz', 'd1');
      for (let i = 0; i < 50; i++) {
        await flipAndAnswer('Je savais');
      }

      expect(textOf(host, 'h1')).toBe('Bravo !');
      expect(api.cards).toHaveBeenCalledTimes(1);
      await click(buttonNamed(host, 'Continuer'));

      expect(api.cards).toHaveBeenCalledTimes(2);
      expect(api.cards).toHaveBeenLastCalledWith('quiz', { deckId: 'd1' });
      expect(cardText()).toBe('b0');
      expect(textOf(host, '.study__count')).toBe('1/50');
      expect(document.activeElement).toBe(query(host, 'button.flashcard'));
    });
  });

  describe('the size of the card text', () => {
    it('should size the question and the answer by their length', async () => {
      api.cards.mockReturnValue(of([{ ...cards[0], front: 'Lima', back: 'a'.repeat(400) }]));
      await render('practice');

      expect(query(host, '.flashcard__text').getAttribute('data-size')).toBe('xl');
      await click(buttonNamed(host, 'Retourner la carte'));
      expect(query(host, '.flashcard__text').getAttribute('data-size')).toBe('xs');
    });
  });

  describe('asking the failed cards again', () => {
    it('should ask the failed cards again as practice, posting nothing', async () => {
      await render('quiz');
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');
      expect(api.answer).toHaveBeenCalledTimes(3);

      await click(buttonNamed(host, 'Revoir les 2 cartes ratées'));

      expect(textOf(host, '.study__count')).toBe('1/2');
      expect(document.activeElement).toBe(query(host, 'button.flashcard'));
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');
      expect(api.answer).toHaveBeenCalledTimes(3);
      expect(api.cards).toHaveBeenCalledTimes(1);

      const texts = [...host.querySelectorAll('.study__end-text')].map((p) =>
        p.textContent?.trim(),
      );
      expect(texts[0]).toBe('Entraînement terminé');
      expect(texts).toContain("Les cartes n'ont pas changé de boîte.");
      expect(
        [...host.querySelectorAll('.study__stat dt')].map((dt) => dt.textContent?.trim()),
      ).toEqual(['bonne réponse', 'à revoir']);
      expect(buttonNamed(host, 'Revoir la carte ratée')).toBeTruthy();
    });

    it('should not offer it when every card was known', async () => {
      await render('practice');
      for (const card of cards) {
        expect(cardText()).toBe(card.front);
        await flipAndAnswer('Je savais');
      }

      expect(host.textContent).not.toContain('Revoir');
      expect(linkNamed(host, 'Terminer').classList).toContain('button--accent');
    });

    it('should not save a test score again after asking the failed cards', async () => {
      await render('test', 'p1');
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');
      expect(exploreApi.saveResult).toHaveBeenCalledTimes(1);

      await click(buttonNamed(host, 'Revoir la carte ratée'));
      await flipAndAnswer('Je savais');

      expect(exploreApi.saveResult).toHaveBeenCalledTimes(1);
      expect(textOf(host, 'h1')).toBe('Bravo !');
    });

    it('should still offer the next due cards of a full quiz', async () => {
      api.cards.mockReturnValueOnce(of(cards.slice(0, 2)));
      fixture = TestBed.createComponent(StudySession);
      fixture.componentRef.setInput('mode', 'quiz');
      fixture.componentRef.setInput('count', '2');
      host = fixture.nativeElement as HTMLElement;
      await fixture.whenStable();
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je savais');
      await click(buttonNamed(host, 'Revoir la carte ratée'));
      await flipAndAnswer('Je savais');

      await click(buttonNamed(host, 'Continuer'));

      expect(api.cards).toHaveBeenCalledTimes(2);
      expect(textOf(host, '.study__count')).toBe('1/3');
    });
  });

  describe('keyboard shortcuts', () => {
    function press(
      key: string,
      init: KeyboardEventInit = {},
      target: EventTarget = document,
    ): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    }

    it('should answer with the arrows once the card is turned over', async () => {
      await render('quiz');
      await click(buttonNamed(host, 'Retourner la carte'));

      const right = press('ArrowRight');
      await settle(fixture);
      await click(buttonNamed(host, 'Retourner la carte'));
      press('ArrowLeft');
      await settle(fixture);

      expect(right.defaultPrevented).toBe(true);
      expect(api.answer.mock.calls).toEqual([
        ['c1', true],
        ['c2', false],
      ]);
      expect(textOf(host, '.study__count')).toBe('3/3');
    });

    it('should not answer before the card is turned over, nor with other keys', async () => {
      await render('quiz');

      const early = press('ArrowRight');
      await click(buttonNamed(host, 'Retourner la carte'));
      press('k');
      press('ArrowRight', { shiftKey: true });
      press('ArrowRight', { ctrlKey: true });
      await settle(fixture);

      expect(early.defaultPrevented).toBe(false);
      expect(api.answer).not.toHaveBeenCalled();
    });

    it('should leave the arrows to the fields while a card is corrected', async () => {
      await render('practice');
      await click(buttonNamed(host, 'Retourner la carte'));
      await click(query(host, 'button[aria-label="Modifier la carte"]'));

      press('ArrowRight', {}, query(host, '#quick-edit-front'));
      press('ArrowLeft');
      await settle(fixture);

      expect(textOf(host, '.study__count')).toBe('1/3');
      expect(sounds.play).not.toHaveBeenCalled();
    });

    it('should name the shortcuts under the answers', async () => {
      await render('quiz');
      await click(buttonNamed(host, 'Retourner la carte'));

      expect(textOf(host, '.study__shortcuts')).toBe(
        'Au clavier : flèche gauche, je ne savais pas ; flèche droite, je savais.',
      );
    });
  });

  describe('card faces', () => {
    it('should mark the question with a "?" and the answer with a star, hidden from screen readers', async () => {
      await render('quiz');

      const front = query(host, 'button.flashcard--front .flashcard__badge');
      expect(front.textContent?.trim()).toBe('?');
      expect(front.getAttribute('aria-hidden')).toBe('true');
      expect(host.querySelector('.flashcard--back')).toBeNull();

      await click(buttonNamed(host, 'Retourner la carte'));

      const back = query(host, 'section.flashcard--back .flashcard__badge');
      expect(back.querySelector('svg')).not.toBeNull();
      expect(back.getAttribute('aria-hidden')).toBe('true');
      expect(host.querySelector('.flashcard--front')).toBeNull();
    });
  });

  describe('correcting a card during the session', () => {
    it('should correct the card in place, keeping the session where it was', async () => {
      await render('quiz');
      await click(buttonNamed(host, 'Retourner la carte'));

      await click(query(host, 'button[aria-label="Modifier la carte"]'));
      expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
      expect(query<HTMLTextAreaElement>(host, '#quick-edit-back').value).toBe('manquer de');
      const back = query<HTMLTextAreaElement>(host, '#quick-edit-back');
      back.value = 'manquer de (qqch)';
      back.dispatchEvent(new Event('input'));
      await click(buttonNamed(host, 'Enregistrer'));

      expect(decksApi.updateCard).toHaveBeenCalledExactlyOnceWith('c1', {
        front: 'to run out of',
        back: 'manquer de (qqch)',
      });
      expect(host.querySelector('app-card-quick-edit')).toBeNull();
      expect(cardText()).toBe('manquer de (qqch)');
      expect(textOf(host, '.study__count')).toBe('1/3');
      expect(document.activeElement).toBe(query(host, 'button[aria-label="Modifier la carte"]'));
      expect(api.answer).not.toHaveBeenCalled();
    });

    it('should save nothing when the learner cancels', async () => {
      await render('practice');

      await click(query(host, 'button[aria-label="Modifier la carte"]'));
      await click(buttonNamed(host, 'Annuler'));

      expect(decksApi.updateCard).not.toHaveBeenCalled();
      expect(host.querySelector('app-card-quick-edit')).toBeNull();
      expect(cardText()).toBe('to run out of');
    });

    it('should refuse an empty side without calling the API', async () => {
      await render('practice');
      await click(query(host, 'button[aria-label="Modifier la carte"]'));
      const front = query<HTMLTextAreaElement>(host, '#quick-edit-front');
      front.value = '  ';
      front.dispatchEvent(new Event('input'));

      await click(buttonNamed(host, 'Enregistrer'));

      expect(decksApi.updateCard).not.toHaveBeenCalled();
      expect(textOf(host, '#quick-edit-front-error')).toBe('Ce champ est obligatoire.');
      expect(front.getAttribute('aria-invalid')).toBe('true');
    });

    it('should say when the card was deleted meanwhile, keeping the dialog open', async () => {
      decksApi.updateCard.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      await render('practice');
      await click(query(host, 'button[aria-label="Modifier la carte"]'));

      await click(buttonNamed(host, 'Enregistrer'));

      expect(textOf(host, 'app-card-quick-edit [role="alert"]')).toBe("Cette carte n'existe plus.");
      expect(host.querySelector('app-card-quick-edit')).not.toBeNull();
    });

    it('should keep the correction when the card comes back in a retry round', async () => {
      await render('practice');
      await click(query(host, 'button[aria-label="Modifier la carte"]'));
      const front = query<HTMLTextAreaElement>(host, '#quick-edit-front');
      front.value = 'to run short of';
      front.dispatchEvent(new Event('input'));
      await click(buttonNamed(host, 'Enregistrer'));
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');

      await click(buttonNamed(host, 'Revoir la carte ratée'));

      expect(cardText()).toBe('to run short of');
    });

    it('should not offer corrections in a test of someone else’s deck', async () => {
      await render('test', 'p1');

      expect(host.querySelector('button[aria-label="Modifier la carte"]')).toBeNull();
    });
  });

  describe('session options from the address', () => {
    async function renderWith(mode: SessionMode, inputs: Record<string, string>): Promise<void> {
      fixture = TestBed.createComponent(StudySession);
      fixture.componentRef.setInput('mode', mode);
      for (const [name, value] of Object.entries(inputs)) {
        fixture.componentRef.setInput(name, value);
      }
      host = fixture.nativeElement as HTMLElement;
      await fixture.whenStable();
    }

    it.each([
      ['10', { count: 10 }],
      ['all', { count: 2000 }],
      ['0', {}],
      ['2001', {}],
      ['abc', {}],
    ])('should ask the quiz for count=%s as %o', async (count, filter) => {
      await renderWith('quiz', { count });

      expect(api.cards).toHaveBeenCalledExactlyOnceWith('quiz', filter);
    });

    it('should practise one box or the failed cards only', async () => {
      await renderWith('practice', { deckId: 'd1', count: '50', box: '3', failed: 'true' });

      expect(api.cards).toHaveBeenCalledExactlyOnceWith('practice', {
        deckId: 'd1',
        count: 50,
        box: 3,
        failed: true,
      });
    });

    it('should ignore an unknown box, and the box and failed filters in a quiz', async () => {
      await renderWith('practice', { box: '6', failed: 'yes' });
      await renderWith('quiz', { box: '2', failed: 'true' });

      expect(api.cards.mock.calls).toEqual([
        ['practice', {}],
        ['quiz', {}],
      ]);
    });

    it('should offer more due cards after a quiz as long as the size asked', async () => {
      api.cards.mockReturnValueOnce(of(cards.slice(0, 2)));
      await renderWith('quiz', { count: '2' });

      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');

      expect(buttonNamed(host, 'Continuer')).toBeTruthy();
    });

    it('should not offer more after a quiz shorter than the size asked', async () => {
      await renderWith('quiz', { count: '10' });

      for (const card of cards) {
        expect(cardText()).toBe(card.front);
        await flipAndAnswer('Je savais');
      }

      expect(host.textContent).not.toContain('Continuer');
    });

    it('should say when no card matches the practice filter', async () => {
      api.cards.mockReturnValue(of([]));

      await renderWith('practice', { failed: 'true' });

      expect(textOf(host, 'h1')).toBe("Aucune carte à t'entraîner ici");
      expect(textOf(host, '.study__end-text')).toBe(
        "Aucune carte ne correspond à ce choix pour l'instant.",
      );
    });
  });

  describe('a quiz over every deck', () => {
    beforeEach(() => render('quiz'));

    it('should load the due cards of every deck once', () => {
      expect(api.cards).toHaveBeenCalledExactlyOnceWith('quiz', {});
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
      expect(progress.getAttribute('aria-label')).toBe('Progression de la session');
      expect(host.textContent).not.toContain('manquer de');
    });

    it('should name the session in a heading for screen readers', () => {
      const heading = query(host, 'h1');
      expect(heading.textContent?.trim()).toBe('Révision');
      expect(heading.classList).toContain('visually-hidden');
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
        ['1', 'carte descend'],
      ]);
      expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('proud');
      expect(linkNamed(host, 'Terminer').getAttribute('href')).toBe('/');
      expect(document.activeElement).toBe(query(host, 'h1'));
      expect(api.answer).toHaveBeenCalledTimes(3);
    });

    it('should play a sound for each answer', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');

      expect(sounds.play.mock.calls).toEqual([['knew'], ['again']]);
    });

    it('should not offer more cards after a quiz shorter than 50', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');

      expect(host.textContent).not.toContain('Continuer');
      expect(api.cards).toHaveBeenCalledTimes(1);
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

      expect(api.cards).toHaveBeenCalledExactlyOnceWith('quiz', { deckId: 'd1' });
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

    it('should name the practice in its heading', () => {
      expect(query(host, 'h1').textContent?.trim()).toBe('Entraînement');
    });

    it('should ask random cards and send no answer', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');

      expect(api.cards).toHaveBeenCalledExactlyOnceWith('practice', { deckId: 'd1' });
      expect(api.answer).not.toHaveBeenCalled();
    });

    it('should end with the score, saying the boxes did not change', async () => {
      await flipAndAnswer('Je savais');
      await flipAndAnswer('Je ne savais pas');
      await flipAndAnswer('Je ne savais pas');

      const texts = [...host.querySelectorAll('.study__end-text')].map((p) =>
        p.textContent?.trim(),
      );
      expect(texts).toEqual([
        'Entraînement terminé',
        "Les cartes n'ont pas changé de boîte.",
        'Un entraînement : les boîtes ne bougent pas.',
      ]);
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
