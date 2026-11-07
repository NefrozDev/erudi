import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import { Deck, DecksApi } from '../../../core/decks/decks-api';
import { DeckForm } from './deck-form';

describe('DeckForm', () => {
  const deck: Deck = {
    id: 'd1',
    name: 'Anglais',
    cardCount: 3,
    dueCount: 1,
    level: 2,
    published: false,
  };
  const api = {
    get: vi.fn<(deckId: string) => Observable<Deck>>(),
    create: vi.fn<(name: string) => Observable<Deck>>(),
    rename: vi.fn<(deckId: string, name: string) => Observable<Deck>>(),
    delete: vi.fn<(deckId: string) => Observable<void>>(),
  };
  let fixture: ComponentFixture<DeckForm>;
  let host: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    api.get.mockReset().mockReturnValue(of(deck));
    api.create.mockReset().mockReturnValue(of({ ...deck, id: 'd9' }));
    api.rename.mockReset().mockReturnValue(of({ ...deck, name: 'English' }));
    api.delete.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DecksApi, useValue: api }],
    });
    const router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  async function render(deckId?: string): Promise<void> {
    fixture = TestBed.createComponent(DeckForm);
    if (deckId !== undefined) {
      fixture.componentRef.setInput('deckId', deckId);
    }
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    button.click();
    await settle(fixture);
  }

  async function saveWith(name: string): Promise<void> {
    typeInto(host, '#deck-name', name);
    await click(buttonNamed(host, 'Enregistrer'));
  }

  describe('when creating', () => {
    beforeEach(() => render());

    it('should start empty, with ways back home and no deletion', () => {
      expect(textOf(host, 'h1')).toBe('Nouveau paquet');
      expect(query<HTMLInputElement>(host, '#deck-name').value).toBe('');
      expect(linkNamed(host, 'Paquets').getAttribute('href')).toBe('/');
      expect(linkNamed(host, 'Annuler').getAttribute('href')).toBe('/');
      expect(host.textContent).not.toContain('Supprimer');
      expect(api.get).not.toHaveBeenCalled();
    });

    it.each([
      ['', 'Ce champ est obligatoire.'],
      ['   ', 'Ce champ est obligatoire.'],
      ['a'.repeat(61), '60 caractères maximum.'],
    ])('should refuse %j and send nothing', async (name, message) => {
      await saveWith(name);

      expect(textOf(host, '#deck-name-error')).toBe(message);
      expect(query(host, '#deck-name').getAttribute('aria-invalid')).toBe('true');
      expect(api.create).not.toHaveBeenCalled();
    });

    it('should create the deck, then open it in place of the form', async () => {
      await saveWith('Anglais');

      expect(api.create).toHaveBeenCalledExactlyOnceWith('Anglais');
      expect(api.rename).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/decks', 'd9'], { replaceUrl: true });
    });

    it.each([
      [409, 'Tu as atteint la limite de 200 paquets.'],
      [500, "L'enregistrement a échoué. Réessaie dans un instant."],
      [0, "L'enregistrement a échoué. Réessaie dans un instant."],
    ])('should explain a %s answer and stay', async (status, message) => {
      api.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));

      await saveWith('Anglais');

      expect(textOf(host, '.page__actions [role="alert"]')).toBe(message);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('when editing', () => {
    beforeEach(() => render('d1'));

    it('should load the deck and fill in its name', () => {
      expect(api.get).toHaveBeenCalledExactlyOnceWith('d1');
      expect(textOf(host, 'h1')).toBe('Modifier le paquet');
      expect(query<HTMLInputElement>(host, '#deck-name').value).toBe('Anglais');
      expect(linkNamed(host, 'Anglais').getAttribute('href')).toBe('/decks/d1');
      expect(linkNamed(host, 'Annuler').getAttribute('href')).toBe('/decks/d1');
    });

    it('should rename the deck, then go back to it', async () => {
      await saveWith('English');

      expect(api.rename).toHaveBeenCalledExactlyOnceWith('d1', 'English');
      expect(api.create).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/decks', 'd1'], { replaceUrl: true });
    });

    it('should ask for confirmation before deleting, and allow keeping the deck', async () => {
      await click(buttonNamed(host, 'Supprimer le paquet'));

      expect(textOf(host, 'app-delete-confirmation [role="alert"]')).toBe(
        "Supprimer « Anglais » et ses cartes ? C'est définitif.",
      );
      expect(api.delete).not.toHaveBeenCalled();

      await click(buttonNamed(host, 'Garder le paquet'));

      expect(host.querySelector('app-delete-confirmation [role="alert"]')).toBeNull();
      expect(buttonNamed(host, 'Supprimer le paquet')).toBeTruthy();
      expect(api.delete).not.toHaveBeenCalled();
    });

    it('should warn that deleting a published deck also withdraws it', async () => {
      api.get.mockReturnValue(of({ ...deck, published: true }));
      await render('d1');

      await click(buttonNamed(host, 'Supprimer le paquet'));

      expect(textOf(host, 'app-delete-confirmation [role="alert"]')).toBe(
        "Supprimer « Anglais » et ses cartes ? Il sera aussi retiré de l'Explorer. C'est définitif.",
      );
    });

    it('should delete the deck once confirmed, then go home', async () => {
      await click(buttonNamed(host, 'Supprimer le paquet'));
      await click(buttonNamed(host, 'Supprimer définitivement'));

      expect(api.delete).toHaveBeenCalledExactlyOnceWith('d1');
      expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/', { replaceUrl: true });
      expect(api.rename).not.toHaveBeenCalled();
    });

    it('should go home when the deck was already deleted elsewhere', async () => {
      api.delete.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

      await click(buttonNamed(host, 'Supprimer le paquet'));
      await click(buttonNamed(host, 'Supprimer définitivement'));

      expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/', { replaceUrl: true });
    });

    it('should explain a failed deletion and allow trying again', async () => {
      api.delete.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

      await click(buttonNamed(host, 'Supprimer le paquet'));
      await click(buttonNamed(host, 'Supprimer définitivement'));

      expect(textOf(host, '.page__actions [role="alert"]')).toBe(
        "L'enregistrement a échoué. Réessaie dans un instant.",
      );
      expect(navigateByUrl).not.toHaveBeenCalled();
      expect(buttonNamed(host, 'Supprimer définitivement').disabled).toBe(false);

      await click(buttonNamed(host, 'Supprimer définitivement'));
      expect(api.delete).toHaveBeenCalledTimes(2);
      expect(navigateByUrl).toHaveBeenCalledTimes(1);
    });
  });

  it('should say when the deck to edit does not exist', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    await render('missing');

    expect(textOf(host, 'h1')).toBe('Paquet introuvable');
    expect(host.querySelector('form')).toBeNull();
  });

  it('should offer to load the deck again after a failure', async () => {
    api.get.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    await render('d1');
    expect(host.querySelector('form')).toBeNull();

    await click(buttonNamed(host, 'Réessayer'));

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(query<HTMLInputElement>(host, '#deck-name').value).toBe('Anglais');
  });
});
