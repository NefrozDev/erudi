import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { BROWSER_LOCATION } from '../browser/browser-location';
import { OnboardingState } from '../onboarding/onboarding-state';
import type { AuthUser } from './auth-api';
import { signedInGuard, signedOutGuard, termsPendingGuard } from './auth-guards';
import { AuthStore } from './auth-store';

describe('auth guards', () => {
  const learner: AuthUser = { id: '1', username: 'chloe', email: 'c@example.be', termsAccepted: true };
  const user = signal<AuthUser | null>(null);
  const hasSeenIntro = vi.fn(() => false);
  const assign = vi.fn<(url: string) => void>();

  beforeEach(() => {
    user.set(null);
    hasSeenIntro.mockReset().mockReturnValue(false);
    assign.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user, signedIn: computed(() => user() !== null) } },
        { provide: OnboardingState, useValue: { hasSeenIntro } },
        { provide: BROWSER_LOCATION, useValue: { assign } },
      ],
    });
  });

  /** Runs the guard as for `url`; the query parameters are read from the route snapshot. */
  function run(guard: typeof signedInGuard, url = '/', query: Record<string, string> = {}): ReturnType<typeof signedInGuard> {
    const route = { queryParamMap: convertToParamMap(query) } as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => guard(route, { url } as RouterStateSnapshot));
  }

  const afterSilentTry = { signIn: 'none' };

  function urlOf(result: unknown): string {
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  describe('signedInGuard', () => {
    it('should let a signed-in learner who accepted the terms through, without looking at the intro', () => {
      user.set(learner);

      expect(run(signedInGuard)).toBe(true);
      expect(hasSeenIntro).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
    });

    it('should first try a silent sign-in for a signed-out arrival, coming back to the same address', () => {
      expect(run(signedInGuard, '/decks/42?tab=cards')).toBe(false);

      expect(assign).toHaveBeenCalledExactlyOnceWith(
        '/api/auth/login?returnTo=%2Fdecks%2F42%3Ftab%3Dcards&lang=fr&silent=true',
      );
      expect(hasSeenIntro).not.toHaveBeenCalled();
    });

    it('should try silently even when the address carries another sign-in outcome', () => {
      expect(run(signedInGuard, '/?signIn=failed', { signIn: 'failed' })).toBe(false);
      expect(assign).toHaveBeenCalledOnce();
    });

    it("should ask a newcomer from another Synapse app for Erudi's terms first", () => {
      user.set({ ...learner, termsAccepted: false });

      expect(urlOf(run(signedInGuard))).toBe('/accept-terms');
      expect(assign).not.toHaveBeenCalled();
    });

    it('should send a first-time visitor to the intro, a returning one to the sign-in, once the silent try is over', () => {
      expect(urlOf(run(signedInGuard, '/?signIn=none', afterSilentTry))).toBe('/welcome');

      hasSeenIntro.mockReturnValue(true);
      expect(urlOf(run(signedInGuard, '/?signIn=none', afterSilentTry))).toBe('/sign-in');
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('termsPendingGuard', () => {
    it('should open the terms screen only to a signed-in learner who has not accepted them', () => {
      user.set({ ...learner, termsAccepted: false });
      expect(run(termsPendingGuard)).toBe(true);

      user.set(learner);
      expect(urlOf(run(termsPendingGuard))).toBe('/');

      user.set(null);
      expect(urlOf(run(termsPendingGuard))).toBe('/sign-in');
    });
  });

  describe('signedOutGuard', () => {
    it('should keep signed-in learners away from the intro and the sign-in', () => {
      expect(run(signedOutGuard)).toBe(true);

      user.set(learner);
      expect(urlOf(run(signedOutGuard))).toBe('/');
    });
  });
});
