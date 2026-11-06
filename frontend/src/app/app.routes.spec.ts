import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from './app.routes';
import { HealthApi } from './core/api/health-api';
import { AuthUser } from './core/auth/auth-api';
import { AuthStore } from './core/auth/auth-store';
import { TranslatedTitleStrategy } from './core/i18n/translated-title-strategy';
import { OnboardingState } from './core/onboarding/onboarding-state';

describe('app routes', () => {
  const user = signal<AuthUser | null>(null);
  const hasSeenIntro = vi.fn(() => false);
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    user.set(null);
    hasSeenIntro.mockReset().mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
        { provide: AuthStore, useValue: { user, signedIn: () => user() !== null } },
        { provide: OnboardingState, useValue: { hasSeenIntro, markIntroSeen: vi.fn() } },
        { provide: HealthApi, useValue: { getStatus: () => of('up') } },
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

    expect(await visit('/')).toBe('/sign-in');
    expect(TestBed.inject(Title).getTitle()).toBe('Connexion · Erudi');
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

  it('should send unknown addresses home', async () => {
    signIn();

    expect(await visit('/does-not-exist')).toBe('/');
  });
});
