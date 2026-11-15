import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import { Card, CardContent, Deck, DecksApi } from '../../../core/decks/decks-api';
import { CardEditor } from './card-editor';

describe('CardEditor', () => {
  const deck: Deck = {
    id: 'd1',
    name: 'Anglais',
    cardCount: 3,
    dueCount: 1,
    level: 2,
    published: false,
  };
  const card: Card = { id: 'c1', deckId: 'd1', front: 'to run ot of', back: 'manquer de', box: 3 };
  const api = {
    get: vi.fn<(deckId: string) => Observable<Deck>>(),
    getCard: vi.fn<(cardId: string) => Observable<Card>>(),
    addCard: vi.fn<(deckId: string, content: CardContent) => Observable<Card>>(),
    updateCard: vi.fn<(cardId: string, content: CardContent) => Observable<Card>>(),
    deleteCard: vi.fn<(cardId: string) => Observable<void>>(),
  };
  let fixture: ComponentFixture<CardEditor>;
  let host: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    api.get.mockReset().mockReturnValue(of(deck));
    api.getCard.mockReset().mockReturnValue(of(card));
    api.addCard.mockReset().mockReturnValue(of({ ...card, id: 'c9', box: 1 }));
    api.updateCard.mockReset().mockReturnValue(of(card));
    api.deleteCard.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DecksApi, useValue: api }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  async function render(cardId?: string): Promise<void> {
    fixture = TestBed.createComponent(CardEditor);
    fixture.componentRef.setInput('deckId', 'd1');
    if (cardId !== undefined) {
      fixture.componentRef.setInput('cardId', cardId);
    }
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    button.click();
    await settle(fixture);
  }

  async function saveWith(front: string, back: string): Promise<void> {
    typeInto(host, '#card-front', front);
    typeInto(host, '#card-back', back);
    await click(
      buttonNamed(host, fixture.componentInstance.cardId() ? 'Enregistrer' : 'Ajouter la carte'),
    );
  }

  describe('when adding', () => {
    beforeEach(() => render());

    it('should start empty in box 1, with ways back to the deck', () => {
      expect(api.get).toHaveBeenCalledExactlyOnceWith('d1');
      expect(api.getCard).not.toHaveBeenCalled();
      expect(textOf(host, 'h1')).toBe('Nouvelles cartes');
      expect(query<HTMLTextAreaElement>(host, '#card-front').value).toBe('');
      expect(textOf(host, '.card-editor__box')).toBe('La carte démarre en boîte 1.');
      expect(linkNamed(host, 'Anglais').getAttribute('href')).toBe('/decks/d1');
      expect(linkNamed(host, 'Annuler').getAttribute('href')).toBe('/decks/d1');
      expect(host.querySelector('app-delete-confirmation')).toBeNull();
    });

    it('should require both sides and send nothing', async () => {
      await saveWith('', '   ');

      expect(textOf(host, '#card-front-error')).toBe('Ce champ est obligatoire.');
      expect(textOf(host, '#card-back-error')).toBe('Ce champ est obligatoire.');
      expect(query(host, '#card-back').getAttribute('aria-invalid')).toBe('true');
      expect(api.addCard).not.toHaveBeenCalled();
    });

    it('should refuse a side longer than 1000 characters', async () => {
      await saveWith('to run out of', 'a'.repeat(1001));

      expect(textOf(host, '#card-back-error')).toBe('1000 caractères maximum.');
      expect(host.querySelector('#card-front-error')).toBeNull();
      expect(api.addCard).not.toHaveBeenCalled();
    });

    it('should add the card with its lines, then empty the form for the next one', async () => {
      await saveWith('to run out of', 'manquer de\nêtre à court de');

      expect(api.addCard).toHaveBeenCalledExactlyOnceWith('d1', {
        front: 'to run out of',
        back: 'manquer de\nêtre à court de',
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(query<HTMLTextAreaElement>(host, '#card-front').value).toBe('');
      expect(query<HTMLTextAreaElement>(host, '#card-back').value).toBe('');
      // Emptied but untouched: no "required" error before the learner types.
      expect(host.querySelector('#card-front-error')).toBeNull();
      expect(document.activeElement).toBe(query(host, '#card-front'));
      expect(textOf(host, '[role="status"]')).toBe('1 carte ajoutée. Écris la suivante.');
      expect(linkNamed(host, 'Terminer').getAttribute('href')).toBe('/decks/d1');
    });

    it('should count the cards added one after the other', async () => {
      await saveWith('to run out of', 'manquer de');
      await saveWith('to look for', 'chercher');

      expect(api.addCard).toHaveBeenCalledTimes(2);
      expect(api.addCard).toHaveBeenLastCalledWith('d1', {
        front: 'to look for',
        back: 'chercher',
      });
      expect(textOf(host, '[role="status"]')).toBe('2 cartes ajoutées. Écris la suivante.');
    });

    it('should add the card on Enter, and keep Shift+Enter as a new line', async () => {
      typeInto(host, '#card-front', 'to run out of');
      typeInto(host, '#card-back', 'manquer de');
      const back = query(host, '#card-back');
      const enter = (shiftKey: boolean) =>
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true, cancelable: true });

      back.dispatchEvent(enter(true));
      await settle(fixture);
      expect(api.addCard).not.toHaveBeenCalled();

      back.dispatchEvent(enter(false));
      await settle(fixture);
      expect(api.addCard).toHaveBeenCalledExactlyOnceWith('d1', {
        front: 'to run out of',
        back: 'manquer de',
      });
    });

    it.each([
      [409, 'Ce paquet a atteint la limite de 2000 cartes.'],
      [500, "L'enregistrement a échoué. Réessaie dans un instant."],
    ])('should explain a %s answer and keep the text', async (status, message) => {
      api.addCard.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));

      await saveWith('to run out of', 'manquer de');

      expect(textOf(host, '.page__actions [role="alert"]')).toBe(message);
      expect(query<HTMLTextAreaElement>(host, '#card-front').value).toBe('to run out of');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('when editing', () => {
    beforeEach(() => render('c1'));

    it('should load the card and fill in both sides', () => {
      expect(api.getCard).toHaveBeenCalledExactlyOnceWith('c1');
      expect(textOf(host, 'h1')).toBe('Modifier la carte');
      expect(query<HTMLTextAreaElement>(host, '#card-front').value).toBe('to run ot of');
      expect(query<HTMLTextAreaElement>(host, '#card-back').value).toBe('manquer de');
      expect(textOf(host, '.card-editor__box')).toBe(
        'La carte reste en boîte 3 : corriger le texte ne la fait pas reculer.',
      );
    });

    it('should save the corrected text, then go back to the deck', async () => {
      await saveWith('to run out of', 'manquer de');

      expect(api.updateCard).toHaveBeenCalledExactlyOnceWith('c1', {
        front: 'to run out of',
        back: 'manquer de',
      });
      expect(api.addCard).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/decks', 'd1'], { replaceUrl: true });
    });

    it('should delete the card once confirmed, then go back to the deck', async () => {
      await click(buttonNamed(host, 'Supprimer la carte'));
      expect(textOf(host, 'app-delete-confirmation [role="alert"]')).toBe(
        "Supprimer cette carte ? C'est définitif.",
      );
      expect(api.deleteCard).not.toHaveBeenCalled();

      await click(buttonNamed(host, 'Supprimer définitivement'));

      expect(api.deleteCard).toHaveBeenCalledExactlyOnceWith('c1');
      expect(api.updateCard).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/decks', 'd1'], { replaceUrl: true });
    });

    it('should explain a failed deletion and stay', async () => {
      api.deleteCard.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      await click(buttonNamed(host, 'Supprimer la carte'));
      await click(buttonNamed(host, 'Supprimer définitivement'));

      expect(textOf(host, '.page__actions [role="alert"]')).toBe(
        "L'enregistrement a échoué. Réessaie dans un instant.",
      );
      expect(navigate).not.toHaveBeenCalled();
    });

    it('should go back to the deck when the card was already deleted elsewhere', async () => {
      api.deleteCard.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

      await click(buttonNamed(host, 'Supprimer la carte'));
      await click(buttonNamed(host, 'Supprimer définitivement'));

      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/decks', 'd1'], { replaceUrl: true });
    });
  });

  it('should say when the card does not exist, or is not the learner’s', async () => {
    api.getCard.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    await render('someone-elses');

    expect(textOf(host, 'h1')).toBe('Carte introuvable');
    expect(host.querySelector('form')).toBeNull();
  });

  it('should say when the deck to add to does not exist', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    await render();

    expect(textOf(host, 'h1')).toBe('Paquet introuvable');
    expect(host.querySelector('form')).toBeNull();
  });

  it('should load both again after a failure', async () => {
    api.getCard.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    await render('c1');
    expect(host.querySelector('form')).toBeNull();

    await click(buttonNamed(host, 'Réessayer'));

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.getCard).toHaveBeenCalledTimes(2);
    expect(query<HTMLTextAreaElement>(host, '#card-front').value).toBe('to run ot of');
  });
});
