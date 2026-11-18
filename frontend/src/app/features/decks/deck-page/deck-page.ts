import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { httpStatus } from '../../../core/api/api-errors';
import { DecksApi } from '../../../core/decks/decks-api';
import { CardDirection, SESSION_SIZES, SessionSize } from '../../../core/study/study-api';
import { countKey } from '../../../shared/i18n/count-key';
import { DeleteConfirmation } from '../../../shared/ui/delete-confirmation/delete-confirmation';
import { Plic } from '../../../shared/ui/plic/plic';
import { deleteDeck } from '../deck-deletion';

/**
 * Screen 8: a deck and its cards, the ways to study it, from the front or the back, and its
 * deletion.
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
