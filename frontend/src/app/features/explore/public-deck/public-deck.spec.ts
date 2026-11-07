import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, settle, textOf } from '../../../../testing/dom';
import { Deck } from '../../../core/decks/decks-api';
import { ExploreApi, PublicDeck } from '../../../core/explore/explore-api';
import { PublicDeckPage } from './public-deck';

describe('PublicDeckPage', () => {
  const now = new Date(2026, 10, 7, 9, 30);
  const publicDeck: PublicDeck = {
    id: 'd1',
    title: 'Code de la route – Belgique',
    category: 'driving',
    author: 'Marie',
    cardCount: 420,
    useCount: 2300,
    description: "Panneaux, priorités et règles essentielles pour préparer l'examen théorique.",
    updatedAt: new Date(2026, 10, 4, 18, 0).toISOString(),
    preview: { front: 'Que signifie un triangle pointe en bas ?', back: 'Cédez le passage' },
    isMine: false,
    bestScore: null,
  };
  const copy: Deck = {
    id: 'd9',
    name: 'Code de la route – Belgique',
    cardCount: 420,
    dueCount: 420,
    level: 1,
    published: false,
  };
  const api = {
    get: vi.fn<(deckId: string) => Observable<PublicDeck>>(),
    copy: vi.fn<(deckId: string) => Observable<Deck>>(),
  };
  let fixture: ComponentFixture<PublicDeckPage>;
  let host: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Only the date is faked: Angular's timers keep running.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    api.get.mockReset().mockReturnValue(of(publicDeck));
    api.copy.mockReset().mockReturnValue(of(copy));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ExploreApi, useValue: api }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  async function render(deckId = 'd1'): Promise<void> {
    fixture = TestBed.createComponent(PublicDeckPage);
    fixture.componentRef.setInput('deckId', deckId);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  function subtitles(): string[] {
    // Only the template's line breaks and indentation: the counts keep their own spaces.
    return [...host.querySelectorAll('.subtitle')].map(
      (line) => line.textContent?.trim().replace(/[\n ]+/g, ' ') ?? '',
    );
  }

  it('should show the public deck, its description and first card (screen 15)', async () => {
    await render();

    expect(api.get).toHaveBeenCalledExactlyOnceWith('d1');
    expect(textOf(host, 'h1')).toBe('Code de la route – Belgique');
    expect(subtitles()).toEqual([
      'par Marie · mis à jour il y a 3 jours',
      '420 cartes · 2 300 utilisations',
    ]);
    const sections = [...host.querySelectorAll('.public-deck__section')].map((section) => [
      textOf(section, 'h2'),
      textOf(section, '.public-deck__text').replace(/\s+/g, ' '),
    ]);
    expect(sections).toEqual([
      [
        'Description',
        "Panneaux, priorités et règles essentielles pour préparer l'examen théorique.",
      ],
      ['Aperçu', 'Que signifie un triangle pointe en bas ? → Réponse : Cédez le passage'],
    ]);
    expect(textOf(host, '.public-deck__notice')).toBe(
      'Contenu créé par un utilisateur, à vérifier.',
    );
    expect(linkNamed(host, 'Explorer').getAttribute('href')).toBe('/explore');
  });

  it('should offer a test, a copy and a report', async () => {
    await render();

    expect(linkNamed(host, 'Me tester').getAttribute('href')).toBe('/explore/d1/test');
    expect(buttonNamed(host, 'Ajouter à mes paquets').disabled).toBe(false);
    expect(linkNamed(host, 'Signaler ce paquet').getAttribute('href')).toBe('/explore/d1/report');
    expect(host.querySelector('.public-deck__score')).toBeNull();
    expect(host.textContent).not.toContain('Modifier la publication');
  });

  it("should show the learner's best score once they took a test", async () => {
    api.get.mockReturnValue(of({ ...publicDeck, bestScore: 85 }));

    await render();

    expect(textOf(host, '.public-deck__score')).toBe('Ton meilleur score : 85 %');
  });

  it('should leave the description out when there is none', async () => {
    api.get.mockReturnValue(of({ ...publicDeck, description: '' }));

    await render();

    expect(host.querySelectorAll('.public-deck__section')).toHaveLength(1);
    expect(textOf(host, '.public-deck__section h2')).toBe('Aperçu');
  });

  it('should say when the deck has no card left, offering only a report', async () => {
    api.get.mockReturnValue(of({ ...publicDeck, cardCount: 0, preview: null }));

    await render();

    expect(textOf(host, '.public-deck__section h2')).toBe('Description');
    expect(host.textContent).not.toContain('Aperçu');
    expect(textOf(host, '.public-deck__notice')).toBe(
      "Ce paquet n'a plus de cartes pour l'instant.",
    );
    expect(host.querySelector('a[href$="/test"]')).toBeNull();
    expect(host.textContent).not.toContain('Ajouter à mes paquets');
    expect(linkNamed(host, 'Signaler ce paquet')).toBeTruthy();
  });

  it('should show its author the way to their deck and publication instead', async () => {
    api.get.mockReturnValue(of({ ...publicDeck, isMine: true }));

    await render();

    expect(textOf(host, '.public-deck__mine')).toBe(
      "C'est ton paquet : tout le monde peut le voir dans l'Explorer.",
    );
    expect(linkNamed(host, 'Ouvrir mon paquet').getAttribute('href')).toBe('/decks/d1');
    expect(linkNamed(host, 'Modifier la publication').getAttribute('href')).toBe(
      '/publish?deckId=d1',
    );
    expect(host.textContent).not.toContain('Ajouter à mes paquets');
    expect(host.textContent).not.toContain('Signaler');
    expect(host.textContent).not.toContain('Me tester');
  });

  it('should copy the deck once, then open the copy', async () => {
    const pending = new Subject<Deck>();
    api.copy.mockReturnValue(pending);
    await render();

    buttonNamed(host, 'Ajouter à mes paquets').click();
    await settle(fixture);
    expect(buttonNamed(host, 'Ajouter à mes paquets').disabled).toBe(true);
    buttonNamed(host, 'Ajouter à mes paquets').click();

    pending.next(copy);
    pending.complete();
    await settle(fixture);

    expect(api.copy).toHaveBeenCalledExactlyOnceWith('d1');
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/decks', 'd9']);
  });

  it.each([
    [409, 'Tu as atteint la limite de 200 paquets.'],
    [500, 'La copie a échoué. Réessaie dans un instant.'],
  ])('should explain a %s answer to a copy and stay', async (status, message) => {
    api.copy.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    await render();

    buttonNamed(host, 'Ajouter à mes paquets').click();
    await settle(fixture);

    expect(textOf(host, '.page__actions [role="alert"]')).toBe(message);
    expect(buttonNamed(host, 'Ajouter à mes paquets').disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should show that the deck is gone when it was unpublished meanwhile', async () => {
    await render();
    api.copy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    buttonNamed(host, 'Ajouter à mes paquets').click();
    await settle(fixture);

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(textOf(host, 'h1')).toBe('Paquet introuvable');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should say when the deck is not published', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    await render('missing');

    expect(textOf(host, 'h1')).toBe('Paquet introuvable');
    expect(textOf(host, '.state-card .subtitle')).toBe("Ce paquet n'est plus publié.");
  });

  it('should load again after a failure', async () => {
    api.get.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    await render();
    expect(textOf(host, '[role="alert"] p')).toBe(
      'Impossible de charger cette page. Vérifie ta connexion.',
    );

    buttonNamed(host, 'Réessayer').click();
    await settle(fixture);

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(textOf(host, 'h1')).toBe('Code de la route – Belgique');
  });
});
