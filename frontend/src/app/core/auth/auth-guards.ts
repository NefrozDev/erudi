import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OnboardingState } from '../onboarding/onboarding-state';
import { AuthStore } from './auth-store';

/**
 * Signed in with Erudi's terms accepted. Signed-out visitors go to the intro the first time,
 * to the sign-in screen afterwards; someone coming from another Synapse app accepted only
 * the account's terms, so they see Erudi's first.
 */
export const signedInGuard: CanActivateFn = () => {
  const user = inject(AuthStore).user();
  if (!user) {
    const target = inject(OnboardingState).hasSeenIntro() ? '/sign-in' : '/welcome';
    return inject(Router).createUrlTree([target]);
  }
  return user.termsAccepted ? true : inject(Router).createUrlTree(['/accept-terms']);
};

/** Signed in, terms accepted or not: the screen that asks for them. */
export const termsPendingGuard: CanActivateFn = () => {
  const user = inject(AuthStore).user();
  if (!user) {
    return inject(Router).createUrlTree(['/sign-in']);
  }
  return user.termsAccepted ? inject(Router).createUrlTree(['/']) : true;
};

/** The intro and the sign-in screen make no sense once signed in. */
export const signedOutGuard: CanActivateFn = () =>
  inject(AuthStore).signedIn() ? inject(Router).createUrlTree(['/']) : true;
