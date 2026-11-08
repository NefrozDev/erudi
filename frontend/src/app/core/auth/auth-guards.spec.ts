import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { OnboardingState } from '../onboarding/onboarding-state';
import type { AuthUser } from './auth-api';
import { signedInGuard, signedOutGuard, termsPendingGuard } from './auth-guards';
import { AuthStore } from './auth-store';

describe('auth guards', () => {
  const learner: AuthUser = { id: '1', username: 'chloe', email: 'c@example.be', termsAccepted: true };
  const user = signal<AuthUser | null>(null);
  const hasSeenIntro = vi.fn(() => false);

  beforeEach(() => {
    user.set(null);
    hasSeenIntro.mockReset().mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user, signedIn: computed(() => user() !== null) } },
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
    it('should let a signed-in learner who accepted the terms through, without looking at the intro', () => {
      user.set(learner);

      expect(run(signedInGuard)).toBe(true);
      expect(hasSeenIntro).not.toHaveBeenCalled();
    });

    it("should ask a newcomer from another Synapse app for Erudi's terms first", () => {
      user.set({ ...learner, termsAccepted: false });

      expect(urlOf(run(signedInGuard))).toBe('/accept-terms');
    });

    it('should send a first-time visitor to the intro, a returning one to the sign-in', () => {
      expect(urlOf(run(signedInGuard))).toBe('/welcome');

      hasSeenIntro.mockReturnValue(true);
      expect(urlOf(run(signedInGuard))).toBe('/sign-in');
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
