import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OnboardingState } from '../onboarding/onboarding-state';
import { AuthStore } from './auth-store';

/** Signed-out visitors go to the intro the first time, to the sign-in screen afterwards. */
export const signedInGuard: CanActivateFn = () => {
  if (inject(AuthStore).signedIn()) {
    return true;
  }

  const target = inject(OnboardingState).hasSeenIntro() ? '/sign-in' : '/welcome';
  return inject(Router).createUrlTree([target]);
};

/** The intro and the account screens make no sense once signed in. */
export const signedOutGuard: CanActivateFn = () =>
  inject(AuthStore).signedIn() ? inject(Router).createUrlTree(['/']) : true;
