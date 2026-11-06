import { TestBed } from '@angular/core/testing';
import { OnboardingState } from './onboarding-state';

describe('OnboardingState', () => {
  let state: OnboardingState;

  beforeEach(() => {
    localStorage.clear();
    state = TestBed.inject(OnboardingState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('should not have seen the intro on a new device', () => {
    expect(state.hasSeenIntro()).toBe(false);
  });

  it('should remember that the intro was seen', () => {
    state.markIntroSeen();

    expect(state.hasSeenIntro()).toBe(true);
    expect(localStorage.getItem('erudi.onboarding-seen')).toBe('true');
  });

  it('should treat blocked storage as a new device instead of failing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(() => state.markIntroSeen()).not.toThrow();
    expect(state.hasSeenIntro()).toBe(false);
  });
});
