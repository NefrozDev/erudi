import { Injectable, InjectionToken, inject, signal } from '@angular/core';

const STORAGE_KEY = 'erudi.sounds-off';

/** Builds the audio context lazily; tests swap it for a fake. `null` where Web Audio is missing. */
export const AUDIO_CONTEXT_FACTORY = new InjectionToken<() => AudioContext | null>(
  'AUDIO_CONTEXT_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => (typeof AudioContext === 'undefined' ? null : new AudioContext()),
  },
);

/** Two short rising notes for a known card, one low note for a card to review again. */
const TONES: Record<'knew' | 'again', { frequency: number; start: number }[]> = {
  knew: [
    { frequency: 660, start: 0 },
    { frequency: 880, start: 0.09 },
  ],
  again: [{ frequency: 220, start: 0 }],
};
const TONE_SECONDS = 0.16;
const VOLUME = 0.12;

/**
 * The study screen's answer sounds, synthesized in the browser (no audio file, nothing from
 * another origin). On by default; turning them off is a per-device preference, like the intro.
 */
@Injectable({ providedIn: 'root' })
export class SoundEffects {
  private readonly createContext = inject(AUDIO_CONTEXT_FACTORY);
  private context: AudioContext | null | undefined;

  private readonly enabledState = signal(readEnabled());
  readonly enabled = this.enabledState.asReadonly();

  setEnabled(enabled: boolean): void {
    this.enabledState.set(enabled);
    try {
      if (enabled) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    } catch {
      // Not remembered on this device: only this visit follows the choice.
    }
  }

  play(sound: 'knew' | 'again'): void {
    if (!this.enabled()) {
      return;
    }

    try {
      // Created on the first answer, a click: browsers only start audio after a user gesture.
      this.context ??= this.createContext();
      const context = this.context;
      if (context === null) {
        return;
      }

      for (const tone of TONES[sound]) {
        const at = context.currentTime + tone.start;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = tone.frequency;
        // A quick fade in and out, so the note does not click.
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(VOLUME, at + 0.02);
        gain.gain.linearRampToValueAtTime(0, at + TONE_SECONDS);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + TONE_SECONDS);
      }
    } catch {
      // A sound is a bonus: studying goes on without it.
    }
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true';
  } catch {
    return true;
  }
}
