import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, settle, textOf } from '../../../../testing/dom';
import { CardSummary, Deck, DecksApi } from '../../../core/decks/decks-api';
import { DeckPage } from './deck-page';

describe('DeckPage', () => {
  const deck: Deck = {
    id: 'd1',
    name: 'Anglais',
    cardCount: 3,
    dueCount: 1,
    level: 2,
    published: false,
  };
  const cards: CardSummary[] = [
    { id: 'c1', front: 'to run out of', box: 2 },
    { id: 'c2', front: 'a deadline', box: 1 },
    { id: 'c3', front: 'to look forward to', box: 4 },
  ];
  const get = vi.fn<(deckId: string) => Observable<Deck>>();
  const listCards = vi.fn<(deckId: string) => Observable<CardSummary[]>>();
  let fixture: ComponentFixture<DeckPage>;

  beforeEach(() => {
    get.mockReset().mockReturnValue(of(deck));
    listCards.mockReset().mockReturnValue(of(cards));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DecksApi, useValue: { get, listCards } }],
    });
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

    expect(linkNamed(host, 'Réviser (1)').getAttribute('href')).toBe('/study/quiz?deckId=d1');
    expect(linkNamed(host, "S'entraîner").getAttribute('href')).toBe('/study/practice?deckId=d1');
    expect(host.querySelector('.deck-page__up-to-date')).toBeNull();
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
    get.mockReturnValue(of({ ...deck, published: true }));

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
});
