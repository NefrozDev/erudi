import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { OnboardingState } from '../onboarding/onboarding-state';
import { signedInGuard, signedOutGuard } from './auth-guards';
import { AuthStore } from './auth-store';

describe('auth guards', () => {
  const signedIn = signal(false);
  const hasSeenIntro = vi.fn(() => false);

  beforeEach(() => {
    signedIn.set(false);
    hasSeenIntro.mockReset().mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { signedIn } },
        { provide: OnboardingState, useValue: { hasSeenIntro } },
      ],
    });
  });

  function run(guard: typeof signedInGuard): ReturnType<typeof signedInGuard> {
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  }

  function urlOf(result: unknown): string {
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  describe('signedInGuard', () => {
    it('should let a signed-in user through without looking at the intro', () => {
      signedIn.set(true);

      expect(run(signedInGuard)).toBe(true);
      expect(hasSeenIntro).not.toHaveBeenCalled();
    });

    it('should send a first-time visitor to the intro', () => {
      expect(urlOf(run(signedInGuard))).toBe('/welcome');
      expect(hasSeenIntro).toHaveBeenCalledTimes(1);
    });

    it('should send a returning visitor to the sign-in screen', () => {
      hasSeenIntro.mockReturnValue(true);

      expect(urlOf(run(signedInGuard))).toBe('/sign-in');
    });
  });

  describe('signedOutGuard', () => {
    it('should let a signed-out visitor through', () => {
      expect(run(signedOutGuard)).toBe(true);
    });

    it('should send a signed-in user home', () => {
      signedIn.set(true);

      expect(urlOf(run(signedOutGuard))).toBe('/');
    });
  });
});
