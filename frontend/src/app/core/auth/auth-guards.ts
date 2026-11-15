import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BROWSER_LOCATION } from '../browser/browser-location';
import { OnboardingState } from '../onboarding/onboarding-state';
import { SILENT_SIGN_IN_DONE, signInUrl } from './auth-api';
import { AuthStore } from './auth-store';

/**
 * Signed in with Erudi's terms accepted. A signed-out arrival first tries a silent sign-in,
 * so someone already signed in to another Synapse app comes straight back signed in. When
 * that is over (`?signIn=none`), signed-out visitors go to the intro the first time, to the
 * sign-in screen afterwards; someone coming from another Synapse app accepted only the
 * account's terms, so they see Erudi's first.
 */
export const signedInGuard: CanActivateFn = (route, state) => {
  const user = inject(AuthStore).user();
  if (!user) {
    if (route.queryParamMap.get(SILENT_SIGN_IN_DONE.param) !== SILENT_SIGN_IN_DONE.value) {
      const language = inject(TranslocoService).getActiveLang();
      inject(BROWSER_LOCATION).assign(signInUrl(state.url, language, true));
      return false;
    }
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
