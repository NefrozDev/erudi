import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormField, FormRoot, form, maxLength, pattern, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { CardContent, DecksApi } from '../../../core/decks/decks-api';
import { visibleError } from '../../../shared/forms/field-errors';
import { DeleteConfirmation } from '../../../shared/ui/delete-confirmation/delete-confirmation';
import { Plic } from '../../../shared/ui/plic/plic';
import { CARD_SIDE_MAX_LENGTH, NOT_BLANK } from '../deck-rules';

/** Screen 9: adds a card (`decks/:deckId/cards/new`), or edits and deletes one (`…/cards/:cardId`). */
@Component({
  selector: 'app-card-editor',
  imports: [DeleteConfirmation, FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './card-editor.html',
  styleUrl: './card-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardEditor {
  private readonly api = inject(DecksApi);
  private readonly router = inject(Router);

  /** From the route. */
  readonly deckId = input.required<string>();
  /** From the route; absent when adding. */
  readonly cardId = input<string>();

  protected readonly editing = computed(() => this.cardId() !== undefined);
  protected readonly deckLink = computed(() => ['/decks', this.deckId()]);

  // The deck gives the back link its name, and tells whether new cards have somewhere to go.
  protected readonly deck = rxResource({
    params: () => this.deckId(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly card = rxResource({
    params: () => this.cardId(),
    stream: ({ params }) => this.api.getCard(params),
  });

  protected readonly notFound = computed(
    () => httpStatus(this.deck.error()) === 404 || httpStatus(this.card.error()) === 404,
  );
  protected readonly failed = computed(
    () => !this.notFound() && !!(this.deck.error() || this.card.error()),
  );
  protected readonly ready = computed(
    () => this.deck.hasValue() && (!this.editing() || this.card.hasValue()),
  );

  protected readonly formError = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly visibleError = visibleError;

  // Filled with the card's text once it is loaded.
  private readonly model = linkedSignal<CardContent>(() =>
    this.card.hasValue()
      ? { front: this.card.value().front, back: this.card.value().back }
      : { front: '', back: '' },
  );

  protected readonly form = form(
    this.model,
    (path) => {
      for (const side of [path.front, path.back]) {
        required(side, { message: 'common.required' });
        pattern(side, NOT_BLANK, { message: 'common.required' });
        maxLength(side, CARD_SIDE_MAX_LENGTH, { message: 'cards.sideTooLong' });
      }
    },
    { submission: { action: () => this.save() } },
  );

  protected reload(): void {
    this.deck.reload();
    this.card.reload();
  }

  protected async delete(): Promise<void> {
    const cardId = this.cardId();
    if (cardId === undefined) {
      return;
    }

    this.formError.set(null);
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.deleteCard(cardId));
    } catch (error) {
      // Already gone (deleted from another device): the outcome is the same.
      if (httpStatus(error) !== 404) {
        this.deleting.set(false);
        this.formError.set('common.saveError');
        return;
      }
    }

    await this.backToDeck();
  }

  private async save(): Promise<void> {
    this.formError.set(null);
    const cardId = this.cardId();
    const content = this.model();

    try {
      await firstValueFrom(
        cardId === undefined
          ? this.api.addCard(this.deckId(), content)
          : this.api.updateCard(cardId, content),
      );
    } catch (error) {
      this.formError.set(httpStatus(error) === 409 ? 'cards.limitReached' : 'common.saveError');
      return;
    }

    await this.backToDeck();
  }

  /** Replaces the form in the history, so "back" from the deck does not reopen it. */
  private async backToDeck(): Promise<void> {
    await this.router.navigate(this.deckLink(), { replaceUrl: true });
  }
}
