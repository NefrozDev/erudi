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
import { TranslatedTitleStrategy } from './core/i18n/translated-title-strategy';
import { OnboardingState } from './core/onboarding/onboarding-state';

describe('app routes', () => {
  const user = signal<AuthUser | null>(null);
  const deck: Deck = { id: 'd1', name: 'Anglais', cardCount: 0, dueCount: 0, level: 0 };
  const decksApi = {
    list: () => of([deck]),
    get: () => of(deck),
    listCards: () => of([]),
    getCard: () =>
      of({ id: 'c1', deckId: 'd1', front: 'a deadline', back: 'une échéance', box: 1 }),
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
    user.set({ id: '1', username: 'chloe', email: 'chloe@example.be' });
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
  ])('should protect %s', async (url) => {
    expect(await visit(url)).toBe('/welcome');
  });

  it.each(['/welcome', '/sign-up', '/sign-in', '/forgot-password'])(
    'should send a signed-in user away from %s',
    async (url) => {
      signIn();

      expect(await visit(url)).toBe('/');
      expect(TestBed.inject(Title).getTitle()).toBe('Accueil · Erudi');
    },
  );

  it('should open the reset link whether signed in or not', async () => {
    expect(await visit('/reset-password')).toBe('/reset-password');

    signIn();
    expect(await visit('/reset-password')).toBe('/reset-password');
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
  ])('should open %s full screen, without the tab bar', async (url, selector, title) => {
    signIn();

    expect(await visit(url)).toBe(url);
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(root.querySelector(selector)).not.toBeNull();
    expect(root.querySelector('app-tab-shell')).toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe(title);
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
