import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PlicMood = 'happy' | 'surprised' | 'proud' | 'sleepy' | 'magician';

interface Spike {
  angle: number;
  fill: string;
}

// The card-spikes fan out behind the head, cycling through the palette.
const SPIKES: readonly Spike[] = [
  { angle: -78, fill: '#ffc93c' },
  { angle: -52, fill: '#ffffff' },
  { angle: -26, fill: '#ff8a8a' },
  { angle: 0, fill: '#ffc93c' },
  { angle: 26, fill: '#9fe8c8' },
  { angle: 52, fill: '#ff8a8a' },
  { angle: 78, fill: '#ffc93c' },
];

// Surprise droplets, around the head beyond the spikes.
const DROPS: readonly { x: number; y: number; angle: number }[] = [
  { x: -8, y: 84, angle: -68 },
  { x: 22, y: 6, angle: -32 },
  { x: 178, y: 6, angle: 32 },
  { x: 208, y: 84, angle: 68 },
];

// Magician: playing cards fly over the head, from the deck in the left hand to the right hand,
// along a parabola TOSS_WIDTH wide and TOSS_HEIGHT high (plic.scss animates the same values).
// Each card starts at its own point of the flight, which is also where it rests when motion
// is reduced.
const TOSS_WIDTH = 176;
const TOSS_HEIGHT = 64;
const TOSS_SECONDS = 2.4;
const HEART = 'M0 5C-6 1.5-6.5-4-3.2-4.8-1.5-5.2 0-4 0-2.6 0-4 1.5-5.2 3.2-4.8 6.5-4 6 1.5 0 5z';
const DIAMOND = 'M0-6 4.5 0 0 6-4.5 0z';
const RED = '#ff5d73';
const INK = '#17153b';
const SUITS = [
  { suit: HEART, ink: RED },
  { suit: DIAMOND, ink: INK },
  { suit: DIAMOND, ink: RED },
  { suit: HEART, ink: INK },
];
const TOSSED_CARDS = SUITS.map((face, index, all) => {
  const progress = (index + 1) / (all.length + 1);
  return {
    ...face,
    x: Math.round(TOSS_WIDTH * progress),
    y: Math.round(-4 * TOSS_HEIGHT * progress * (1 - progress)),
    angle: Math.round(-30 + 60 * progress),
    delay: `${(-TOSS_SECONDS * progress).toFixed(2)}s`,
  };
});

/**
 * Plic, the hedgehog whose spikes are flashcards. Decorative: the screen's text always says
 * what Plic expresses, so assistive technologies skip it.
 */
@Component({
  selector: 'app-plic',
  templateUrl: './plic.svg',
  styleUrl: './plic.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-mood]': 'mood()',
    '[attr.data-waving]': 'waving() || null',
  },
})
export class Plic {
  readonly mood = input<PlicMood>('happy');
  /** Waves hello every few seconds, unless the device asks for reduced motion. */
  readonly waving = input(false);

  protected readonly spikes = SPIKES;
  protected readonly drops = DROPS;
  protected readonly tossedCards = TOSSED_CARDS;
  // Proud: the right arm as drawn, then the same arm mirrored to the left.
  protected readonly cheerSides = ['', 'translate(200 0) scale(-1 1)'];
}
