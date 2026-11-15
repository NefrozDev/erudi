import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  Signal,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, map } from 'rxjs';
import { httpStatus } from '../../core/api/api-errors';
import { ExploreApi, TestResult } from '../../core/explore/explore-api';
import { SoundEffects } from '../../core/sound/sound-effects';
import { CardDirection, QUIZ_SIZE, StudyApi, StudyMode } from '../../core/study/study-api';
import { countKey } from '../../shared/i18n/count-key';
import { shuffle } from '../../shared/random/shuffle';
import { BoxMeter } from '../../shared/ui/box-meter/box-meter';
import { Plic } from '../../shared/ui/plic/plic';

/** `test` asks 20 cards of a public deck (`explore/:deckId/test`) and saves the score. */
export type SessionMode = StudyMode | 'test';

/** A card of any session: a public deck's cards have no box. */
interface SessionCard {
  id: string;
  deckName: string;
  front: string;
  back: string;
  box?: number;
  /** Asked from the back: the back is the question, the front the answer. */
  reversed: boolean;
}

const DIRECTIONS: readonly CardDirection[] = ['front', 'back', 'mixed'];

/**
 * Screens 10 to 12: one card at a time, question then answer, then the session's results.
 * A quiz answer is saved before the next card shows, so leaving midway keeps the progress.
 * Practice keeps its answers in the page and moves no card. A test does the same, then saves
 * its score. Quiz cards come shuffled (the server picks the 50 most urgent, in order), and a
 * full quiz offers the next ones. `?direction=` asks the front, the back or either.
 */
@Component({
  selector: 'app-study-session',
  imports: [BoxMeter, NgTemplateOutlet, Plic, RouterLink, TranslocoPipe],
  templateUrl: './study-session.html',
  styleUrl: './study-session.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudySession {
  private readonly api = inject(StudyApi);
  private readonly exploreApi = inject(ExploreApi);
  private readonly injector = inject(Injector);
  private readonly sounds = inject(SoundEffects);

  /** From the route's data. */
  readonly mode = input.required<SessionMode>();
  /**
   * From the query string (`?deckId=`), absent for a session over every deck; for a test, the
   * public deck from the route.
   */
  readonly deckId = input<string>();
  /** From the query string; anything else than `back` or `mixed` asks the front. */
  readonly direction = input<string>();

  /** Moves on to load the next quiz cards. */
  private readonly round = signal(0);

  protected readonly cards = rxResource<
    SessionCard[],
    { mode: SessionMode; deckId?: string; direction: CardDirection; round: number }
  >({
    params: () => ({
      mode: this.mode(),
      deckId: this.deckId(),
      direction: DIRECTIONS.find((known) => known === this.direction()) ?? 'front',
      round: this.round(),
    }),
    stream: ({ params }) =>
      (params.mode === 'test'
        ? this.exploreApi.testCards(params.deckId ?? '')
        : this.api.cards(params.mode, params.deckId)
      ).pipe(
        map((cards) => (params.mode === 'quiz' ? shuffle(cards) : cards)),
        map((cards) =>
          cards.map((card) => ({
            ...card,
            reversed:
              params.direction === 'back' || (params.direction === 'mixed' && Math.random() < 0.5),
          })),
        ),
      ),
  });

  protected readonly index = signal(0);
  protected readonly flipped = signal(false);
  protected readonly knew = signal(0);
  protected readonly toReview = signal(0);
  protected readonly answering = signal(false);
  protected readonly answerFailed = signal(false);
  /** A test's saved score, with the learner's best one. */
  protected readonly result = signal<TestResult | null>(null);
  protected readonly resultFailed = signal(false);

  protected readonly total = computed(() =>
    this.cards.hasValue() ? this.cards.value().length : 0,
  );
  protected readonly current = computed(() =>
    this.cards.hasValue() ? this.cards.value()[this.index()] : undefined,
  );
  protected readonly finished = computed(() => this.total() > 0 && this.index() >= this.total());
  protected readonly progress = computed(() =>
    this.total() === 0 ? 0 : (100 * this.index()) / this.total(),
  );
  /** The side asked, then the side shown as the answer. */
  protected readonly question = computed(() => {
    const card = this.current();
    return card === undefined ? '' : card.reversed ? card.back : card.front;
  });
  protected readonly reply = computed(() => {
    const card = this.current();
    return card === undefined ? '' : card.reversed ? card.front : card.back;
  });
  /** A full quiz may have left due cards behind. */
  protected readonly canContinue = computed(
    () => this.mode() === 'quiz' && this.total() === QUIZ_SIZE,
  );
  protected readonly notFound = computed(() => httpStatus(this.cards.error()) === 404);
  /** Shown as soon as the test ends, before it is saved. */
  protected readonly score = computed(() =>
    this.total() === 0 ? 0 : Math.round((100 * this.knew()) / this.total()),
  );
  protected readonly exitLink = computed(() => {
    const deckId = this.deckId();
    if (this.mode() === 'test') {
      return deckId === undefined ? ['/explore'] : ['/explore', deckId];
    }
    return deckId === undefined ? ['/'] : ['/decks', deckId];
  });
  protected readonly knewKey = computed(() =>
    countKey(this.mode() === 'quiz' ? 'study.done.movedUp' : 'study.done.knew', this.knew()),
  );

  private readonly frontFace = viewChild<ElementRef<HTMLElement>>('frontFace');
  private readonly backFace = viewChild<ElementRef<HTMLElement>>('backFace');
  private readonly doneTitle = viewChild<ElementRef<HTMLElement>>('doneTitle');

  protected flip(): void {
    this.flipped.set(true);
    // The button that had the focus is gone: screen readers go on with the answer.
    this.focusAfterRender(this.backFace);
  }

  protected async answer(knew: boolean): Promise<void> {
    const card = this.current();
    if (card === undefined || this.answering()) {
      return;
    }

    if (this.mode() === 'quiz') {
      this.answering.set(true);
      this.answerFailed.set(false);
      try {
        await firstValueFrom(this.api.answer(card.id, knew));
      } catch (error) {
        // 409: another tab already answered this card today. It has moved; carry on.
        if (httpStatus(error) !== 409) {
          this.answerFailed.set(true);
          return;
        }
      } finally {
        this.answering.set(false);
      }
    }

    this.sounds.play(knew ? 'knew' : 'again');
    (knew ? this.knew : this.toReview).update((count) => count + 1);
    this.index.update((index) => index + 1);
    this.flipped.set(false);
    this.focusAfterRender(this.finished() ? this.doneTitle : this.frontFace);

    if (this.finished() && this.mode() === 'test') {
      await this.saveResult();
    }
  }

  /** Loads the next due cards; the answered ones have moved and are no longer due. */
  protected continueQuiz(): void {
    this.index.set(0);
    this.knew.set(0);
    this.toReview.set(0);
    this.flipped.set(false);
    this.round.update((round) => round + 1);
    // The front of the new first card takes the focus from the button that disappears.
    this.focusAfterRender(this.frontFace);
  }

  protected async saveResult(): Promise<void> {
    const deckId = this.deckId();
    if (deckId === undefined) {
      return;
    }

    this.resultFailed.set(false);
    try {
      this.result.set(
        await firstValueFrom(this.exploreApi.saveResult(deckId, this.knew(), this.total())),
      );
    } catch {
      this.resultFailed.set(true);
    }
  }

  private focusAfterRender(target: Signal<ElementRef<HTMLElement> | undefined>): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}
