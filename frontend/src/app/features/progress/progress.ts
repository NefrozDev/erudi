import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DecksApi } from '../../core/decks/decks-api';
import { StudyApi } from '../../core/study/study-api';
import { countKey } from '../../shared/i18n/count-key';

interface BoxRow {
  number: number;
  count: number;
  countKey: string;
}

interface DeckProgress {
  id: string;
  name: string;
  masteredCount: number;
  cardCount: number;
  /** Mastered share, 0 to 100. */
  percent: number;
}

/**
 * Screen 13: how many cards each Leitner box holds and how often it comes back, then each
 * deck's share of mastered cards (box 4 or 5).
 */
@Component({
  selector: 'app-progress',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './progress.html',
  styleUrl: './progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Progress {
  private readonly api = inject(StudyApi);
  private readonly decksApi = inject(DecksApi);

  protected readonly summary = rxResource({ stream: () => this.api.summary() });
  protected readonly decks = rxResource({ stream: () => this.decksApi.list() });

  /** Decks with cards only: an empty deck has no progress to show. */
  protected readonly deckRows = computed<DeckProgress[]>(() =>
    this.decks.hasValue()
      ? this.decks
          .value()
          .filter((deck) => deck.cardCount > 0)
          .map((deck) => ({
            id: deck.id,
            name: deck.name,
            masteredCount: deck.masteredCount,
            cardCount: deck.cardCount,
            percent: Math.round((100 * deck.masteredCount) / deck.cardCount),
          }))
      : [],
  );

  protected readonly boxes = computed<BoxRow[]>(() =>
    this.summary.hasValue()
      ? this.summary.value().boxes.map((count, index) => ({
          number: index + 1,
          count,
          countKey: countKey('progress.cards', count),
        }))
      : [],
  );
  protected readonly total = computed(() => this.boxes().reduce((sum, box) => sum + box.count, 0));
  protected readonly subtitleKey = computed(() => countKey('progress.subtitle', this.total()));
}
