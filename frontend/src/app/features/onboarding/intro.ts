import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { OnboardingState } from '../../core/onboarding/onboarding-state';
import { Plic, PlicMood } from '../../shared/ui/plic/plic';

interface IntroSlide {
  key: 'boxes' | 'answers' | 'start';
  mood: PlicMood;
}

const SLIDES: readonly IntroSlide[] = [
  { key: 'boxes', mood: 'happy' },
  { key: 'answers', mood: 'surprised' },
  { key: 'start', mood: 'proud' },
];

/** Screens 1 to 3: how the boxes work, then sign-up or sign-in. */
@Component({
  selector: 'app-intro',
  imports: [TranslocoPipe, Plic],
  templateUrl: './intro.html',
  styleUrl: './intro.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Intro {
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingState);

  protected readonly slides = SLIDES;
  protected readonly index = signal(0);
  protected readonly slide = computed(() => SLIDES[this.index()]);
  protected readonly isLast = computed(() => this.index() === SLIDES.length - 1);

  protected next(): void {
    this.index.update((index) => Math.min(index + 1, SLIDES.length - 1));
  }

  protected leave(target: '/sign-up' | '/sign-in'): void {
    this.onboarding.markIntroSeen();
    void this.router.navigateByUrl(target);
  }
}
