import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { httpStatus } from '../../../core/api/api-errors';
import { DecksApi } from '../../../core/decks/decks-api';
import {
  CardDirection,
  MAX_SESSION_SIZE,
  SESSION_SIZES,
  SessionSize,
  StudyApi,
} from '../../../core/study/study-api';
import { countKey } from '../../../shared/i18n/count-key';
import { Duration, sessionDuration } from '../../../shared/i18n/duration';
import { relativeDay } from '../../../shared/i18n/relative-day';
import { DeleteConfirmation } from '../../../shared/ui/delete-confirmation/delete-confirmation';
import { Plic } from '../../../shared/ui/plic/plic';
import { deleteDeck } from '../deck-deletion';

interface BoxRow {
  number: number;
  count: number;
  /** Width of the bar, 0 to 100, relative to the deck's cards. */
  percent: number;
  countKey: string;
}

/**
 * Screen 8: a deck and its cards, the ways to study it (how many cards, which side, the
 * failed ones only, one box) with the time it should take, its progress, and its deletion.
 */
@Component({
  selector: 'app-deck-page',
  imports: [DeleteConfirmation, Plic, RouterLink, TranslocoPipe],
  templateUrl: './deck-page.html',
  styleUrl: './deck-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckPage {
  private readonly api = inject(DecksApi);
  private readonly router = inject(Router);
  private readonly studyApi = inject(StudyApi);
  private readonly language = inject(TranslocoService).getActiveLang();

  /** From the route (`decks/:deckId`). */
  readonly deckId = input.required<string>();

  protected readonly deck = rxResource({
    params: () => this.deckId(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly cards = rxResource({
    params: () => this.deckId(),
    stream: ({ params }) => this.api.listCards(params),
  });

  // Not critical: without it, the estimate and the deck's progress stay hidden.
  protected readonly stats = rxResource({
    params: () => this.deckId(),
    stream: ({ params }) => this.studyApi.deckStats(params),
  });

  protected readonly directions: readonly CardDirection[] = ['front', 'back', 'mixed'];
  protected readonly sizes = SESSION_SIZES;
  /** For both study links; the front, the default, stays out of the address. */
  protected readonly direction = signal<CardDirection>('front');
  /** How many cards both study links ask. */
  protected readonly size = signal<SessionSize>(20);
  /** Practice only: the cards failed at the last quiz. */
  protected readonly onlyFailed = signal(false);
  protected readonly quizParams = computed(() => ({
    deckId: this.deckId(),
    direction: this.direction() === 'front' ? null : this.direction(),
    count: this.size(),
  }));
  protected readonly practiceParams = computed(() => ({
    ...this.quizParams(),
    failed: this.onlyFailed() ? true : null,
  }));

  protected readonly notFound = computed(
    () => httpStatus(this.deck.error()) === 404 || httpStatus(this.cards.error()) === 404,
  );
  protected readonly failed = computed(
    () => !this.notFound() && !!(this.deck.error() || this.cards.error()),
  );
  /** How long the quiz link's round takes: the due cards, up to the size picked. */
  protected readonly quizDuration = computed<Duration | null>(() => {
    if (!this.deck.hasValue() || !this.stats.hasValue()) {
      return null;
    }
    const size = this.size();
    const cards = Math.min(this.deck.value().dueCount, size === 'all' ? MAX_SESSION_SIZE : size);
    return sessionDuration(cards, this.stats.value().secondsPerCard);
  });
  protected readonly boxRows = computed<BoxRow[]>(() => {
    if (!this.stats.hasValue()) {
      return [];
    }
    const boxes = this.stats.value().boxes;
    const total = Math.max(
      1,
      boxes.reduce((sum, count) => sum + count, 0),
    );
    return boxes.map((count, index) => ({
      number: index + 1,
      count,
      percent: Math.round((100 * count) / total),
      countKey: countKey('progress.cards', count),
    }));
  });
  protected readonly lastStudied = computed(() => {
    const day = this.stats.hasValue() ? this.stats.value().lastStudiedOn : null;
    if (day === null) {
      return null;
    }
    // A calendar day: built in the device's time zone, not parsed as UTC midnight.
    const [year, month, date] = day.split('-').map(Number);
    return relativeDay(new Date(year, month - 1, date), new Date(), this.language);
  });
  protected readonly numberFormat = new Intl.NumberFormat(this.language);
  protected readonly cardCountKey = computed(() =>
    countKey('decks.cards', this.deck.hasValue() ? this.deck.value().cardCount : 0),
  );

  protected readonly deleting = signal(false);
  protected readonly deleteFailed = signal(false);

  protected async delete(): Promise<void> {
    this.deleteFailed.set(false);
    this.deleting.set(true);
    if (await deleteDeck(this.api, this.deckId())) {
      await this.router.navigateByUrl('/', { replaceUrl: true });
      return;
    }
    this.deleting.set(false);
    this.deleteFailed.set(true);
  }

  protected reload(): void {
    this.deck.reload();
    this.cards.reload();
  }
}
