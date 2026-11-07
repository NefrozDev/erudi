import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { httpStatus } from '../../../core/api/api-errors';
import { DecksApi } from '../../../core/decks/decks-api';
import { countKey } from '../../../shared/i18n/count-key';
import { Plic } from '../../../shared/ui/plic/plic';

/** Screen 8: a deck and its cards. */
@Component({
  selector: 'app-deck-page',
  imports: [Plic, RouterLink, TranslocoPipe],
  templateUrl: './deck-page.html',
  styleUrl: './deck-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckPage {
  private readonly api = inject(DecksApi);

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

  protected readonly notFound = computed(
    () => httpStatus(this.deck.error()) === 404 || httpStatus(this.cards.error()) === 404,
  );
  protected readonly failed = computed(
    () => !this.notFound() && !!(this.deck.error() || this.cards.error()),
  );
  protected readonly cardCountKey = computed(() =>
    countKey('decks.cards', this.deck.hasValue() ? this.deck.value().cardCount : 0),
  );

  protected reload(): void {
    this.deck.reload();
    this.cards.reload();
  }
}
