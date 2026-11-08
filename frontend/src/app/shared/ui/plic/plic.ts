import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PlicMood = 'happy' | 'surprised' | 'proud' | 'sleepy';

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
}
