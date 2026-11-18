import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf } from '../../../../testing/dom';
import { CardSummary, Deck, DecksApi } from '../../../core/decks/decks-api';
import { DeckPage } from './deck-page';

describe('DeckPage', () => {
  const deck: Deck = {
    id: 'd1',
    name: 'Anglais',
    cardCount: 3,
    dueCount: 1,
    level: 2,
    published: false, masteredCount: 0,
  };
  const cards: CardSummary[] = [
    { id: 'c1', front: 'to run out of', box: 2 },
    { id: 'c2', front: 'a deadline', box: 1 },
    { id: 'c3', front: 'to look forward to', box: 4 },
  ];
  const get = vi.fn<(deckId: string) => Observable<Deck>>();
  const listCards = vi.fn<(deckId: string) => Observable<CardSummary[]>>();
  const deleteDeck = vi.fn<(deckId: string) => Observable<void>>();
  let fixture: ComponentFixture<DeckPage>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    get.mockReset().mockReturnValue(of(deck));
    listCards.mockReset().mockReturnValue(of(cards));
    deleteDeck.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DecksApi, useValue: { get, listCards, delete: deleteDeck } },
      ],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  async function render(deckId = 'd1'): Promise<HTMLElement> {
    fixture = TestBed.createComponent(DeckPage);
    fixture.componentRef.setInput('deckId', deckId);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function cardLinks(host: HTMLElement): HTMLAnchorElement[] {
    return [...host.querySelectorAll<HTMLAnchorElement>('.card-row')];
  }

  it('should load the deck and its cards once', async () => {
    await render();

    expect(get).toHaveBeenCalledExactlyOnceWith('d1');
    expect(listCards).toHaveBeenCalledExactlyOnceWith('d1');
  });

  it('should show the deck with its counts and a way back', async () => {
    const host = await render();

    expect(textOf(host, 'h1')).toBe('Anglais');
    expect(textOf(host, '.subtitle').replace(/\s+/g, ' ')).toBe('3 cartes · 1 à réviser');
    expect(linkNamed(host, 'Paquets').getAttribute('href')).toBe('/');
    expect(linkNamed(host, 'Modifier').getAttribute('href')).toBe('/decks/d1/edit');
    expect(linkNamed(host, 'Ajouter une carte').getAttribute('href')).toBe('/decks/d1/cards/new');
  });

  it("should start a quiz on the deck's due cards, or practice on any of them", async () => {
    const host = await render();

    expect(linkNamed(host, 'Réviser (1)').getAttribute('href')).toBe('/study/quiz?deckId=d1&count=20');
    expect(linkNamed(host, "S'entraîner").getAttribute('href')).toBe('/study/practice?deckId=d1&count=20');
    expect(host.querySelector('.deck-page__up-to-date')).toBeNull();
  });

  it('should explain the difference between a quiz and practice, tied to each link', async () => {
    const host = await render();

    const quiz = linkNamed(host, 'Réviser (1)');
    const practice = linkNamed(host, "S'entraîner");
    expect(textOf(host, `#${quiz.getAttribute('aria-describedby')}`)).toContain(
      'Elles changent de boîte',
    );
    expect(textOf(host, `#${practice.getAttribute('aria-describedby')}`)).toContain(
      'Leurs boîtes ne bougent pas',
    );
  });

  it('should ask the front by default, and pass another side to both study links', async () => {
    const host = await render();
    const options = [...host.querySelectorAll<HTMLInputElement>('input[name="direction"]')];
    expect(options.map((option) => option.parentElement?.textContent?.trim())).toEqual([
      'Recto → verso',
      'Verso → recto',
      'Au hasard',
    ]);
    expect(options[0].checked).toBe(true);

    options[1].click();
    await settle(fixture);

    expect(linkNamed(host, 'Réviser (1)').getAttribute('href')).toBe(
      '/study/quiz?deckId=d1&direction=back&count=20',
    );
    expect(linkNamed(host, "S'entraîner").getAttribute('href')).toBe(
      '/study/practice?deckId=d1&direction=back&count=20',
    );

    options[2].click();
    await settle(fixture);
    expect(linkNamed(host, "S'entraîner").getAttribute('href')).toBe(
      '/study/practice?deckId=d1&direction=mixed&count=20',
    );
  });

  it('should ask 20 cards by default, and pass another size to both study links', async () => {
    const host = await render();
    const options = [...host.querySelectorAll<HTMLInputElement>('input[name="size"]')];
    expect(options.map((option) => option.parentElement?.textContent?.trim())).toEqual([
      '10',
      '20',
      '50',
      '100',
      'Toutes',
    ]);
    expect(options[1].checked).toBe(true);

    options[4].click();
    await settle(fixture);

    expect(linkNamed(host, 'Réviser (1)').getAttribute('href')).toBe(
      '/study/quiz?deckId=d1&count=all',
    );
    expect(linkNamed(host, "S'entraîner").getAttribute('href')).toBe(
      '/study/practice?deckId=d1&count=all',
    );
  });

  it('should practise the failed cards only on demand, leaving the quiz as it is', async () => {
    const host = await render();
    const failed = query<HTMLInputElement>(host, 'input[type="checkbox"]');
    expect(failed.checked).toBe(false);
    expect(failed.parentElement?.textContent?.trim()).toBe(
      "M'entraîner seulement sur les cartes ratées à la dernière révision",
    );

    failed.click();
    await settle(fixture);

    expect(linkNamed(host, "S'entraîner").getAttribute('href')).toBe(
      '/study/practice?deckId=d1&count=20&failed=true',
    );
    expect(linkNamed(host, 'Réviser (1)').getAttribute('href')).toBe(
      '/study/quiz?deckId=d1&count=20',
    );
  });

  it('should say when nothing is due, still offering practice', async () => {
    get.mockReturnValue(of({ ...deck, dueCount: 0 }));

    const host = await render();

    expect(textOf(host, '.deck-page__up-to-date')).toBe(
      "Rien à réviser aujourd'hui dans ce paquet.",
    );
    expect(host.querySelector('a[href^="/study/quiz"]')).toBeNull();
    expect(linkNamed(host, "S'entraîner")).toBeTruthy();
  });

  it('should offer to publish a deck that has cards', async () => {
    const host = await render();

    expect(linkNamed(host, "Publier dans l'Explorer").getAttribute('href')).toBe(
      '/publish?deckId=d1',
    );
    expect(host.querySelector('.deck-page__publication')).toBeNull();
  });

  it('should show that a deck is published, with its public page and publication', async () => {
    get.mockReturnValue(of({ ...deck, published: true, masteredCount: 0 }));

    const host = await render();

    expect(textOf(host, '.deck-page__publication span')).toBe("Publié dans l'Explorer");
    expect(linkNamed(host, 'Voir').getAttribute('href')).toBe('/explore/d1');
    expect(linkNamed(host, 'Modifier la publication').getAttribute('href')).toBe(
      '/publish?deckId=d1',
    );
    expect(host.textContent).not.toContain("Publier dans l'Explorer");
  });

  it('should list the cards with their box, each opening its editor', async () => {
    const host = await render();

    expect(cardLinks(host).map((link) => textOf(link, '.card-row__front'))).toEqual([
      'to run out of',
      'a deadline',
      'to look forward to',
    ]);
    expect(cardLinks(host).map((link) => textOf(link, '.card-row__box'))).toEqual([
      'Boîte 2',
      'Boîte 1',
      'Boîte 4',
    ]);
    expect(cardLinks(host)[1].getAttribute('href')).toBe('/decks/d1/cards/c2');
  });

  it('should use the singular for a single card', async () => {
    get.mockReturnValue(of({ ...deck, cardCount: 1, dueCount: 0 }));
    listCards.mockReturnValue(of([cards[0]]));

    const host = await render();

    expect(textOf(host, '.subtitle').replace(/\s+/g, ' ')).toBe('1 carte · 0 à réviser');
  });

  it('should invite to add a first card to an empty deck', async () => {
    get.mockReturnValue(of({ ...deck, cardCount: 0, dueCount: 0, level: 0 }));
    listCards.mockReturnValue(of([]));

    const host = await render();

    expect(textOf(host, 'h2')).toBe('Ce paquet est vide');
    expect(host.querySelector('a[href^="/study/"]')).toBeNull();
    expect(host.querySelector('input[name="direction"]')).toBeNull();
    expect(host.querySelector('.deck-page__up-to-date')).toBeNull();
    expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('surprised');
    expect(linkNamed(host, 'Ajouter une carte')).toBeTruthy();
    expect(cardLinks(host)).toHaveLength(0);
  });

  it('should say when the deck does not exist, or is not the learner’s', async () => {
    get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    listCards.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const host = await render('someone-elses');

    expect(textOf(host, 'h1')).toBe('Paquet introuvable');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('a[href="/decks/someone-elses/edit"]')).toBeNull();
  });

  it('should explain another failure and load both again on demand', async () => {
    listCards.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

    const host = await render();
    expect(textOf(host, '[role="alert"] p')).toBe(
      'Impossible de charger cette page. Vérifie ta connexion.',
    );
    expect(cardLinks(host)).toHaveLength(0);

    buttonNamed(host, 'Réessayer').click();
    await settle(fixture);

    expect(get).toHaveBeenCalledTimes(2);
    expect(listCards).toHaveBeenCalledTimes(2);
    expect(cardLinks(host)).toHaveLength(3);
  });

  describe('deletion', () => {
    async function confirmDeletion(host: HTMLElement): Promise<void> {
      buttonNamed(host, 'Supprimer le paquet').click();
      await settle(fixture);
      buttonNamed(host, 'Supprimer définitivement').click();
      await settle(fixture);
    }

    it('should ask before deleting, and delete nothing when the learner keeps the deck', async () => {
      const host = await render();

      buttonNamed(host, 'Supprimer le paquet').click();
      await settle(fixture);
      expect(textOf(host, 'app-delete-confirmation [role="alert"]')).toBe(
        "Supprimer « Anglais » et ses cartes ? C'est définitif.",
      );
      buttonNamed(host, 'Garder le paquet').click();
      await settle(fixture);

      expect(deleteDeck).not.toHaveBeenCalled();
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('should warn that a published deck leaves the Explorer too', async () => {
      get.mockReturnValue(of({ ...deck, published: true }));
      const host = await render();

      buttonNamed(host, 'Supprimer le paquet').click();
      await settle(fixture);

      expect(textOf(host, 'app-delete-confirmation [role="alert"]')).toContain(
        "Il sera aussi retiré de l'Explorer.",
      );
    });

    it('should delete the deck once confirmed, then go home in place of it', async () => {
      const host = await render();

      await confirmDeletion(host);

      expect(deleteDeck).toHaveBeenCalledExactlyOnceWith('d1');
      expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/', { replaceUrl: true });
    });

    it('should go home when another device already deleted the deck', async () => {
      deleteDeck.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      const host = await render();

      await confirmDeletion(host);

      expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/', { replaceUrl: true });
    });

    it('should stay and say so when the deletion fails, letting the learner try again', async () => {
      deleteDeck.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
      const host = await render();

      await confirmDeletion(host);

      expect(navigateByUrl).not.toHaveBeenCalled();
      expect(textOf(host, 'p.alert')).toBe("L'enregistrement a échoué. Réessaie dans un instant.");
      expect(buttonNamed(host, 'Supprimer définitivement').disabled).toBe(false);

      buttonNamed(host, 'Supprimer définitivement').click();
      await settle(fixture);
      expect(deleteDeck).toHaveBeenCalledTimes(2);
      expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/', { replaceUrl: true });
    });
  });
});
