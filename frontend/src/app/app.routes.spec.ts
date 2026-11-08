import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from './app.routes';
import { AuthUser } from './core/auth/auth-api';
import { AuthStore } from './core/auth/auth-store';
import { Deck, DecksApi } from './core/decks/decks-api';
import { ExploreApi, PublicDeck } from './core/explore/explore-api';
import { StudyApi } from './core/study/study-api';
import { TranslatedTitleStrategy } from './core/i18n/translated-title-strategy';
import { OnboardingState } from './core/onboarding/onboarding-state';

describe('app routes', () => {
  const user = signal<AuthUser | null>(null);
  const deck: Deck = {
    id: 'd1',
    name: 'Anglais',
    cardCount: 0,
    dueCount: 0,
    level: 0,
    published: false,
  };
  const decksApi = {
    list: () => of([deck]),
    get: () => of(deck),
    listCards: () => of([]),
    getCard: () =>
      of({ id: 'c1', deckId: 'd1', front: 'a deadline', back: 'une échéance', box: 1 }),
  };
  const studyApi = {
    summary: () => of({ reviewedToday: 0, dueCount: 1, boxes: [1, 0, 0, 0, 0] }),
    cards: vi.fn(() =>
      of([
        {
          id: 'c1',
          deckId: 'd1',
          deckName: 'Anglais',
          front: 'a deadline',
          back: 'une échéance',
          box: 1,
        },
      ]),
    ),
  };
  const publicDeck: PublicDeck = {
    id: 'p1',
    title: 'Capitales du monde',
    category: 'studies',
    author: 'Sofia',
    cardCount: 1,
    useCount: 0,
    description: '',
    updatedAt: '2026-11-07T10:00:00Z',
    preview: { front: 'Belgique', back: 'Bruxelles' },
    isMine: false,
    bestScore: null,
  };
  const exploreApi = {
    search: () => of([publicDeck]),
    get: vi.fn(() => of(publicDeck)),
    testCards: vi.fn(() =>
      of([{ id: 't1', deckName: 'Capitales du monde', front: 'Belgique', back: 'Bruxelles' }]),
    ),
  };
  const hasSeenIntro = vi.fn(() => false);
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    user.set(null);
    hasSeenIntro.mockReset().mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        // As in app.config.ts: the screens read the route's ids as inputs.
        provideRouter(routes, withComponentInputBinding()),
        { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
        { provide: AuthStore, useValue: { user, signedIn: () => user() !== null } },
        { provide: OnboardingState, useValue: { hasSeenIntro, markIntroSeen: vi.fn() } },
        { provide: DecksApi, useValue: decksApi },
        { provide: StudyApi, useValue: studyApi },
        { provide: ExploreApi, useValue: exploreApi },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  async function visit(url: string): Promise<string> {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    return TestBed.inject(Router).url;
  }

  function signIn(): void {
    user.set({ id: '1', username: 'chloe', email: 'chloe@example.be', termsAccepted: true });
  }

  it('should greet a first-time visitor with the intro', async () => {
    expect(await visit('/')).toBe('/welcome');
    expect(TestBed.inject(Title).getTitle()).toBe('Bienvenue · Erudi');
  });

  it('should send a returning signed-out visitor to sign-in', async () => {
    hasSeenIntro.mockReturnValue(true);

    expect(await visit('/settings')).toBe('/sign-in');
    expect(TestBed.inject(Title).getTitle()).toBe('Connexion · Erudi');
  });

  it.each([
    '/explore',
    '/progress',
    '/settings',
    '/decks/new',
    '/decks/d1',
    '/decks/d1/edit',
    '/decks/d1/cards/new',
    '/decks/d1/cards/c1',
    '/study/quiz',
    '/study/practice?deckId=d1',
    '/explore/p1',
    '/explore/p1/test',
    '/explore/p1/report',
    '/publish?deckId=d1',
  ])('should protect %s', async (url) => {
    expect(await visit(url)).toBe('/welcome');
  });

  it.each(['/welcome', '/sign-in'])(
    'should send a signed-in user away from %s',
    async (url) => {
      signIn();

      expect(await visit(url)).toBe('/');
      expect(TestBed.inject(Title).getTitle()).toBe('Accueil · Erudi');
    },
  );

  it.each(['/sign-up', '/forgot-password', '/reset-password'])(
    'should send %s, now handled by the Synapse account, to the sign-in',
    async (url) => {
      expect(await visit(url)).toBe('/sign-in');
    },
  );

  it("should ask a newcomer from another Synapse app for Erudi's terms before anything else", async () => {
    user.set({ id: '1', username: 'chloe', email: 'chloe@example.be', termsAccepted: false });

    expect(await visit('/decks/new')).toBe('/accept-terms');
    expect(harness.fixture.nativeElement.querySelector('app-accept-terms')).not.toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Bienvenue · Erudi');
  });

  it('should send the old account deletion screen to the settings', async () => {
    signIn();

    expect(await visit('/settings/delete-account')).toBe('/settings');
  });

  it('should open the terms whether signed in or not, full screen', async () => {
    const root = harness.fixture.nativeElement as HTMLElement;

    expect(await visit('/terms')).toBe('/terms');
    expect(root.querySelector('app-terms')).not.toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe("Conditions d'utilisation · Erudi");

    signIn();
    expect(await visit('/terms')).toBe('/terms');
    expect(root.querySelector('app-tab-shell')).toBeNull();
  });

  it('should open the tabs for a signed-in user, inside the shell', async () => {
    signIn();

    expect(await visit('/settings')).toBe('/settings');
    expect(
      harness.fixture.nativeElement.querySelector('app-tab-shell app-settings'),
    ).not.toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Réglages · Erudi');
  });

  it.each([
    ['/decks/new', 'app-deck-form', 'Nouveau paquet · Erudi'],
    ['/decks/d1', 'app-deck-page', 'Paquet · Erudi'],
    ['/decks/d1/edit', 'app-deck-form', 'Modifier le paquet · Erudi'],
    ['/decks/d1/cards/new', 'app-card-editor', 'Nouvelle carte · Erudi'],
    ['/decks/d1/cards/c1', 'app-card-editor', 'Modifier la carte · Erudi'],
    ['/explore/p1', 'app-public-deck', 'Paquet public · Erudi'],
    ['/explore/p1/report', 'app-report-form', 'Signaler un paquet · Erudi'],
    ['/publish?deckId=d1', 'app-publish-form', 'Publier un paquet · Erudi'],
  ])('should open %s full screen, without the tab bar', async (url, selector, title) => {
    signIn();

    expect(await visit(url)).toBe(url);
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(root.querySelector(selector)).not.toBeNull();
    expect(root.querySelector('app-tab-shell')).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe(title);
  });

  it.each([
    ['/study/quiz', 'quiz', undefined, 'Révision · Erudi'],
    ['/study/practice?deckId=d1', 'practice', 'd1', 'Entraînement · Erudi'],
  ])('should open %s full screen, in the right mode', async (url, mode, deckId, title) => {
    signIn();
    studyApi.cards.mockClear();

    expect(await visit(url)).toBe(url);
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-study-session .flashcard')).not.toBeNull();
    expect(root.querySelector('app-tab-shell')).toBeNull();
    expect(studyApi.cards).toHaveBeenCalledExactlyOnceWith(mode, deckId);
    expect(TestBed.inject(Title).getTitle()).toBe(title);
  });

  it('should open a test of a public deck full screen, on that deck', async () => {
    signIn();
    exploreApi.testCards.mockClear();
    studyApi.cards.mockClear();

    expect(await visit('/explore/p1/test')).toBe('/explore/p1/test');
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-study-session .flashcard__chip')?.textContent?.trim()).toBe(
      'Capitales du monde',
    );
    expect(root.querySelector('app-tab-shell')).toBeNull();
    expect(exploreApi.testCards).toHaveBeenCalledExactlyOnceWith('p1');
    expect(studyApi.cards).not.toHaveBeenCalled();
    expect(TestBed.inject(Title).getTitle()).toBe('Test · Erudi');
  });

  it('should show the public decks in the explore tab', async () => {
    signIn();

    expect(await visit('/explore?category=studies')).toBe('/explore?category=studies');
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-tab-shell app-explore-page')).not.toBeNull();
    expect(root.querySelector('.chip[aria-pressed="true"]')?.textContent?.trim()).toBe('Études');
    expect(TestBed.inject(Title).getTitle()).toBe('Explorer · Erudi');
  });

  it('should hand the public deck id to its sheet', async () => {
    signIn();
    exploreApi.get.mockClear();

    await visit('/explore/p1');

    expect(exploreApi.get).toHaveBeenCalledExactlyOnceWith('p1');
  });

  it('should show the boxes in the progress tab', async () => {
    signIn();

    expect(await visit('/progress')).toBe('/progress');
    expect(
      harness.fixture.nativeElement.querySelector('app-tab-shell app-progress'),
    ).not.toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Progrès · Erudi');
  });

  it('should hand the route ids to the deck screens', async () => {
    signIn();

    await visit('/decks/d1/cards/c1');

    const editor = harness.fixture.nativeElement.querySelector('app-card-editor') as HTMLElement;
    expect(editor.querySelector('a.back-link')?.getAttribute('href')).toBe('/decks/d1');
    expect(editor.querySelector<HTMLTextAreaElement>('#card-front')?.value).toBe('a deadline');
  });

  it('should send unknown addresses home', async () => {
    signIn();

    expect(await visit('/does-not-exist')).toBe('/');
  });
});
