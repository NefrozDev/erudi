import { Injectable } from '@angular/core';

const STORAGE_KEY = 'erudi.onboarding-seen';

/**
 * Whether this device already showed the intro screens. A per-device convenience only:
 * losing it just shows the intro again.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingState {
  hasSeenIntro(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      // Storage can be blocked (private browsing, site settings).
      return false;
    }
  }

  markIntroSeen(): void {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Not remembered: the intro shows again next time, which is harmless.
    }
  }
}
