import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SPIKES } from '../plic/plic';

export const CELEBRATION_SCENES = ['car', 'podium', 'lab', 'gift', 'rocket'] as const;
export type CelebrationScene = (typeof CELEBRATION_SCENES)[number];

/** How long a scene plays, in milliseconds: celebration.scss uses the same length. */
export const CELEBRATION_MS = 2600;

/** Whether the device asks for reduced motion: then no scene plays at all. */
export const PREFERS_REDUCED_MOTION = new InjectionToken<() => boolean>('PREFERS_REDUCED_MOTION', {
  providedIn: 'root',
  factory: () => () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
});

/** A scene picked at random, never the one just played, so two in a row always differ. */
export function nextScene(
  previous: CelebrationScene | undefined,
  random: () => number = Math.random,
): CelebrationScene {
  const choices = CELEBRATION_SCENES.filter((scene) => scene !== previous);
  return choices[Math.min(Math.floor(random() * choices.length), choices.length - 1)];
}

// Gift scene: confetti falling from the open box, each with its own drift, spin and delay.
const CONFETTI_COLORS = ['#ffc93c', '#ff8a8a', '#9fe8c8', '#ffffff', '#5b3df5'];
const CONFETTI = Array.from({ length: 14 }, (_, index) => ({
  x: 30 + ((index * 67) % 260),
  fill: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  drift: `${((index % 5) - 2) * 14}px`,
  spin: `${(index % 2 === 0 ? 1 : -1) * (200 + index * 25)}deg`,
  delay: `${((index % 4) * 0.12).toFixed(2)}s`,
}));

// Lab scene: the mixed flask explodes into sparkles, in every direction and to the panel's
// edges. Three rings at different reaches; each sparkle has its own size, colour and spin,
// spread by fixed steps (no randomness, so every explosion looks the same and tests hold).
const SPARKLE_COLORS = ['#ffc93c', '#ffffff', '#ff8a8a', '#9fe8c8', '#ffc93c', '#d9d2ff'];
const SPARKLE_COUNT = 36;
const SPARKLES = Array.from({ length: SPARKLE_COUNT }, (_, index) => {
  const ring = index % 3;
  const angle = ((index * 360) / SPARKLE_COUNT + ring * 7) * (Math.PI / 180);
  const reach = 70 + ring * 55 + (index % 5) * 6;
  return {
    dx: `${Math.round(Math.cos(angle) * reach)}px`,
    dy: `${Math.round(Math.sin(angle) * reach)}px`,
    scale: (0.7 + ((index * 7) % 10) / 9).toFixed(2),
    spin: `${(index % 2 === 0 ? 1 : -1) * (90 + (index % 4) * 60)}deg`,
    fill: SPARKLE_COLORS[index % SPARKLE_COLORS.length],
    delay: `${(ring * 0.06).toFixed(2)}s`,
  };
});

/**
 * A short scene where Plic celebrates a known answer, popping over the screen and gone in
 * under three seconds (WCAG 2.2.2). Decorative: the session already says the answer counted,
 * so assistive technologies skip it, and it lets clicks through.
 */
@Component({
  selector: 'app-celebration',
  imports: [NgTemplateOutlet],
  templateUrl: './celebration.svg',
  styleUrl: './celebration.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-scene]': 'scene()',
  },
})
export class Celebration {
  readonly scene = input.required<CelebrationScene>();
  /** Emitted once the scene is over, so the parent can remove it. */
  readonly finished = output();

  protected readonly spikes = SPIKES;
  protected readonly confetti = CONFETTI;
  protected readonly sparkles = SPARKLES;
  protected readonly sides = ['', 'translate(200 0) scale(-1 1)'];
  protected readonly labHands = [
    { side: '', liquid: '#3ccf91' },
    { side: 'translate(200 0) scale(-1 1)', liquid: '#ff5c7a' },
  ];

  constructor() {
    const timer = setTimeout(() => this.finished.emit(), CELEBRATION_MS);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
