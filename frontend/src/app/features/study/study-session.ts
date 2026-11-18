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
import {
  CardDirection,
  MAX_SESSION_SIZE,
  QUIZ_SIZE,
  StudyApi,
  StudyFilter,
  StudyMode,
} from '../../core/study/study-api';
import { countKey } from '../../shared/i18n/count-key';
import { shuffle } from '../../shared/random/shuffle';
import { CardContent } from '../../core/decks/decks-api';
import { BoxMeter } from '../../shared/ui/box-meter/box-meter';
import { Plic } from '../../shared/ui/plic/plic';
import { CardQuickEdit } from './card-quick-edit/card-quick-edit';
import { cardTextSize } from './card-text-size';

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

/** The answer each arrow key gives once the card is turned over: "knew" on the right. */
const ANSWER_KEYS: Readonly<Record<string, boolean>> = { ArrowLeft: false, ArrowRight: true };

/** Arrows move the caret in a field: they answer nothing there. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select') !== null)
  );
}

/**
 * Screens 10 to 12: one card at a time, question then answer, then the session's results.
 * A quiz answer is saved before the next card shows, so leaving midway keeps the progress.
 * Practice keeps its answers in the page and moves no card. A test does the same, then saves
 * its score. Quiz cards come shuffled (the server picks the 50 most urgent, in order), and a
 * full quiz offers the next ones. `?direction=` asks the front, the back or either, `?count=`
 * how many cards (`all` for every one), and practice can keep to one `?box=` or to the cards
 * failed at the last quiz (`?failed=true`). At the end, the failed cards can be asked again,
 * as practice. The learner's own cards can be corrected at any time. Once a card is turned
 * over, the left and right arrow keys answer "I did not know" and "I knew" (arrows, not
 * letters, so no single character key triggers anything: WCAG 2.1.4).
 */
@Component({
  selector: 'app-study-session',
  host: { '(document:keydown)': 'onKeydown($event)' },
  imports: [BoxMeter, CardQuickEdit, NgTemplateOutlet, Plic, RouterLink, TranslocoPipe],
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
  /** From the query string: a number of cards or `all`; the API's default otherwise. */
  readonly count = input<string>();
  /** From the query string, practice only: 1 to 5. */
  readonly box = input<string>();
  /** From the query string, practice only: `true` asks the cards failed at the last quiz. */
  readonly failed = input<string>();

  private readonly filter = computed<StudyFilter>(() => {
    const filter: StudyFilter = {};
    const deckId = this.deckId();
    const count = toCount(this.count());
    const box = toBox(this.box());
    if (deckId !== undefined) filter.deckId = deckId;
    if (count !== undefined) filter.count = count;
    if (this.mode() === 'practice' && box !== undefined) filter.box = box;
    if (this.mode() === 'practice' && this.failed() === 'true') filter.failed = true;
    return filter;
  });

  /** Moves on to load the next quiz cards. */
  private readonly round = signal(0);

  protected readonly cards = rxResource<
    SessionCard[],
    { mode: SessionMode; filter: StudyFilter; direction: CardDirection; round: number }
  >({
    params: () => ({
      mode: this.mode(),
      filter: this.filter(),
      direction: DIRECTIONS.find((known) => known === this.direction()) ?? 'front',
      round: this.round(),
    }),
    stream: ({ params }) =>
      (params.mode === 'test'
        ? this.exploreApi.testCards(params.filter.deckId ?? '')
        : this.api.cards(params.mode, params.filter)
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

  /** The failed cards asked again, as practice: nothing is saved. */
  private readonly retry = signal<SessionCard[] | null>(null);
  /** This round's failed cards, for another round. */
  private readonly failedCards = signal<SessionCard[]>([]);
  /** Texts corrected during the session, by card id. */
  private readonly corrections = signal<Readonly<Record<string, CardContent>>>({});

  /** What this round counts as: a retry round is practice, whatever the session. */
  protected readonly kind = computed<SessionMode>(() =>
    this.retry() === null ? this.mode() : 'practice',
  );
  private readonly roundCards = computed(
    () => this.retry() ?? (this.cards.hasValue() ? this.cards.value() : []),
  );
  protected readonly total = computed(() => this.roundCards().length);
  protected readonly current = computed(() => {
    const card = this.roundCards()[this.index()];
    const correction = card === undefined ? undefined : this.corrections()[card.id];
    return correction === undefined ? card : { ...card, ...correction };
  });
  protected readonly failedCount = computed(() => this.failedCards().length);
  /** Public deck cards are not the learner's to correct. */
  protected readonly canEdit = computed(() => this.mode() !== 'test');
  protected readonly editing = signal(false);
  protected readonly editedContent = computed<CardContent | null>(() => {
    const card = this.current();
    return card === undefined ? null : { front: card.front, back: card.back };
  });
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
  protected readonly questionSize = computed(() => cardTextSize(this.question()));
  protected readonly replySize = computed(() => cardTextSize(this.reply()));
  /** A full quiz may have left due cards behind, even after asking the failed ones again. */
  protected readonly canContinue = computed(
    () =>
      this.mode() === 'quiz' &&
      this.cards.hasValue() &&
      this.cards.value().length === (this.filter().count ?? QUIZ_SIZE),
  );
  /** Practice kept to a box or to the failed cards: an empty session says so. */
  protected readonly filtered = computed(
    () => this.filter().box !== undefined || this.filter().failed === true,
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
    countKey(this.kind() === 'quiz' ? 'study.done.movedUp' : 'study.done.knew', this.knew()),
  );
  protected readonly againKey = computed(() =>
    countKey(this.kind() === 'quiz' ? 'study.done.movedDown' : 'study.done.again', this.toReview()),
  );
  protected readonly retryKey = computed(() => countKey('study.done.retry', this.failedCount()));

  private readonly frontFace = viewChild<ElementRef<HTMLElement>>('frontFace');
  private readonly backFace = viewChild<ElementRef<HTMLElement>>('backFace');
  private readonly doneTitle = viewChild<ElementRef<HTMLElement>>('doneTitle');
  private readonly editButton = viewChild<ElementRef<HTMLElement>>('editButton');

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

    if (this.kind() === 'quiz') {
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
    if (!knew) {
      this.failedCards.update((failed) => [...failed, card]);
    }
    this.index.update((index) => index + 1);
    this.flipped.set(false);
    this.focusAfterRender(this.finished() ? this.doneTitle : this.frontFace);

    if (this.finished() && this.kind() === 'test') {
      await this.saveResult();
    }
  }

  /** Loads the next due cards; the answered ones have moved and are no longer due. */
  protected continueQuiz(): void {
    this.retry.set(null);
    this.startRound();
    this.round.update((round) => round + 1);
  }

  /** Asks this round's failed cards again, in a new order, as practice. */
  protected retryFailed(): void {
    this.retry.set(shuffle(this.failedCards()));
    this.startRound();
  }

  /** The corrected text shows at once, on both faces and in a later retry round. */
  protected edited(content: CardContent): void {
    const card = this.current();
    if (card !== undefined) {
      this.corrections.update((corrections) => ({ ...corrections, [card.id]: content }));
    }
    this.stopEditing();
  }

  protected stopEditing(): void {
    this.editing.set(false);
    this.focusAfterRender(this.editButton);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const answer = ANSWER_KEYS[event.key];
    if (
      answer === undefined ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !this.flipped() ||
      this.editing() ||
      isEditable(event.target)
    ) {
      return;
    }
    event.preventDefault();
    void this.answer(answer);
  }

  private startRound(): void {
    this.index.set(0);
    this.knew.set(0);
    this.toReview.set(0);
    this.failedCards.set([]);
    this.flipped.set(false);
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

function toCount(value: string | undefined): number | undefined {
  if (value === 'all') {
    return MAX_SESSION_SIZE;
  }
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_SESSION_SIZE ? count : undefined;
}

function toBox(value: string | undefined): number | undefined {
  const box = Number(value);
  return Number.isInteger(box) && box >= 1 && box <= 5 ? box : undefined;
}
