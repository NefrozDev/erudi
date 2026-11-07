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
import { DeckCategory, ExploreApi } from '../../../core/explore/explore-api';
import { visibleError } from '../../../shared/forms/field-errors';
import { DeleteConfirmation } from '../../../shared/ui/delete-confirmation/delete-confirmation';
import { Plic } from '../../../shared/ui/plic/plic';
import { NOT_BLANK } from '../../decks/deck-rules';
import { DECK_CATEGORIES, DESCRIPTION_MAX_LENGTH, PUBLIC_TITLE_MAX_LENGTH } from '../explore-rules';

interface PublicationModel {
  deckId: string;
  title: string;
  category: DeckCategory | '';
  description: string;
}

/**
 * Screen 16: publishes one of the learner's decks, or updates or withdraws its publication.
 * `publish?deckId=` comes from a deck's page with that deck already chosen.
 */
@Component({
  selector: 'app-publish-form',
  imports: [DeleteConfirmation, FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './publish-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishForm {
  private readonly decksApi = inject(DecksApi);
  private readonly exploreApi = inject(ExploreApi);
  private readonly router = inject(Router);

  /** From the query string; absent when coming from the Explorer. */
  readonly deckId = input<string>();

  protected readonly categories = DECK_CATEGORIES;
  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly unpublishing = signal(false);

  protected readonly decks = rxResource({ stream: () => this.decksApi.list() });
  /** The deck picked in the list; the address only gives the first pick. */
  protected readonly chosenId = linkedSignal(() => this.deckId() ?? '');
  protected readonly chosen = computed(() =>
    this.decks.hasValue()
      ? this.decks.value().find((deck) => deck.id === this.chosenId())
      : undefined,
  );
  protected readonly publication = rxResource({
    params: () => {
      const deck = this.chosen();
      return deck?.published ? deck.id : undefined;
    },
    stream: ({ params }) => this.exploreApi.getPublication(params),
  });
  /** A published deck's fields wait for its publication, so they do not change under the learner's eyes. */
  protected readonly ready = computed(
    () => !this.chosen()?.published || this.publication.hasValue(),
  );

  // Filled with the chosen deck's name, or with its current publication.
  private readonly model = linkedSignal<PublicationModel>(() => {
    const deck = this.chosen();
    const publication = this.publication.hasValue() ? this.publication.value() : undefined;
    return {
      deckId: deck?.id ?? '',
      title: publication?.title ?? deck?.name ?? '',
      category: publication?.category ?? '',
      description: publication?.description ?? '',
    };
  });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.deckId, { message: 'explore.publish.deckRequired' });
      required(path.title, { message: 'common.required' });
      pattern(path.title, NOT_BLANK, { message: 'common.required' });
      maxLength(path.title, PUBLIC_TITLE_MAX_LENGTH, { message: 'explore.publish.titleTooLong' });
      required(path.category, { message: 'explore.publish.categoryRequired' });
      maxLength(path.description, DESCRIPTION_MAX_LENGTH, {
        message: 'explore.publish.descriptionTooLong',
      });
    },
    { submission: { action: () => this.publish() } },
  );

  protected async unpublish(): Promise<void> {
    const deck = this.chosen();
    if (deck === undefined) {
      return;
    }

    this.formError.set(null);
    this.unpublishing.set(true);
    try {
      await firstValueFrom(this.exploreApi.unpublish(deck.id));
    } catch (error) {
      // Already withdrawn (from another device): the outcome is the same.
      if (httpStatus(error) !== 404) {
        this.unpublishing.set(false);
        this.formError.set('common.saveError');
        return;
      }
    }

    await this.router.navigate(['/decks', deck.id], { replaceUrl: true });
  }

  private async publish(): Promise<void> {
    this.formError.set(null);
    const { deckId, title, category, description } = this.model();
    if (category === '') {
      return;
    }

    try {
      await firstValueFrom(this.exploreApi.publish(deckId, { title, category, description }));
    } catch (error) {
      const status = httpStatus(error);
      this.formError.set(
        status === 409
          ? 'explore.publish.emptyDeck'
          : status === 404
            ? 'decks.notFoundText'
            : 'common.saveError',
      );
      return;
    }

    // Shows the deck as others now see it; "back" returns to where the learner came from.
    await this.router.navigate(['/explore', deckId], { replaceUrl: true });
  }
}
