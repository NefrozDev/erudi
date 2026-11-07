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
import { DecksApi } from '../../../core/decks/decks-api';
import { visibleError } from '../../../shared/forms/field-errors';
import { DeleteConfirmation } from '../../../shared/ui/delete-confirmation/delete-confirmation';
import { Plic } from '../../../shared/ui/plic/plic';
import { DECK_NAME_MAX_LENGTH, NOT_BLANK } from '../deck-rules';

/** Creates a deck (`decks/new`), or renames and deletes one (`decks/:deckId/edit`). */
@Component({
  selector: 'app-deck-form',
  imports: [DeleteConfirmation, FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './deck-form.html',
  styleUrl: './deck-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckForm {
  private readonly api = inject(DecksApi);
  private readonly router = inject(Router);

  /** From the route; absent when creating. */
  readonly deckId = input<string>();

  protected readonly editing = computed(() => this.deckId() !== undefined);
  protected readonly deck = rxResource({
    params: () => this.deckId(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly notFound = computed(() => httpStatus(this.deck.error()) === 404);
  /** Where "back" and "cancel" go. */
  protected readonly returnLink = computed(() => {
    const deckId = this.deckId();
    return deckId === undefined ? ['/'] : ['/decks', deckId];
  });

  protected readonly formError = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly visibleError = visibleError;

  // Filled with the current name once the deck is loaded.
  private readonly model = linkedSignal(() => ({
    name: this.deck.hasValue() ? this.deck.value().name : '',
  }));

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.name, { message: 'common.required' });
      pattern(path.name, NOT_BLANK, { message: 'common.required' });
      maxLength(path.name, DECK_NAME_MAX_LENGTH, { message: 'decks.form.nameTooLong' });
    },
    { submission: { action: () => this.save() } },
  );

  protected async delete(): Promise<void> {
    const deckId = this.deckId();
    if (deckId === undefined) {
      return;
    }

    this.formError.set(null);
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.delete(deckId));
    } catch (error) {
      // Already gone (deleted from another device): the outcome is the same.
      if (httpStatus(error) !== 404) {
        this.deleting.set(false);
        this.formError.set('common.saveError');
        return;
      }
    }

    await this.router.navigateByUrl('/', { replaceUrl: true });
  }

  private async save(): Promise<void> {
    this.formError.set(null);
    const deckId = this.deckId();
    const { name } = this.model();

    let savedId: string;
    try {
      const deck = await firstValueFrom(
        deckId === undefined ? this.api.create(name) : this.api.rename(deckId, name),
      );
      savedId = deck.id;
    } catch (error) {
      this.formError.set(
        httpStatus(error) === 409 ? 'decks.form.limitReached' : 'common.saveError',
      );
      return;
    }

    // Replaces the form in the history, so "back" from the deck does not reopen it.
    await this.router.navigate(['/decks', savedId], { replaceUrl: true });
  }
}
