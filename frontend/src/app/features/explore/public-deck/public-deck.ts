import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { ExploreApi } from '../../../core/explore/explore-api';
import { countKey } from '../../../shared/i18n/count-key';
import { relativeDay } from '../../../shared/i18n/relative-day';
import { Plic } from '../../../shared/ui/plic/plic';

/**
 * Screen 15: a public deck, with a test of 20 of its cards, a copy into the learner's decks,
 * and a report. The author sees a way to their own deck instead.
 */
@Component({
  selector: 'app-public-deck',
  imports: [Plic, RouterLink, TranslocoPipe],
  templateUrl: './public-deck.html',
  styleUrl: './public-deck.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicDeckPage {
  private readonly api = inject(ExploreApi);
  private readonly router = inject(Router);
  private readonly language = inject(TranslocoService).getActiveLang();
  private readonly numbers = new Intl.NumberFormat(this.language);

  /** From the route (`explore/:deckId`). */
  readonly deckId = input.required<string>();

  protected readonly deck = rxResource({
    params: () => this.deckId(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly notFound = computed(() => httpStatus(this.deck.error()) === 404);

  /** The counts and date as the subtitle shows them. */
  protected readonly facts = computed(() => {
    if (!this.deck.hasValue()) {
      return null;
    }
    const deck = this.deck.value();
    return {
      updated: relativeDay(new Date(deck.updatedAt), new Date(), this.language),
      cardsKey: countKey('decks.cards', deck.cardCount),
      cards: this.numbers.format(deck.cardCount),
      usesKey: countKey('explore.uses', deck.useCount),
      uses: this.numbers.format(deck.useCount),
    };
  });

  protected readonly copying = signal(false);
  protected readonly copyError = signal<string | null>(null);

  /** Copies the deck, then opens the copy: it is the learner's own deck from now on. */
  protected async copy(): Promise<void> {
    if (this.copying()) {
      return;
    }

    this.copyError.set(null);
    this.copying.set(true);
    let copyId: string;
    try {
      copyId = (await firstValueFrom(this.api.copy(this.deckId()))).id;
    } catch (error) {
      this.copying.set(false);
      const status = httpStatus(error);
      if (status === 404) {
        // No longer published: the page says so.
        this.deck.reload();
        return;
      }
      this.copyError.set(status === 409 ? 'explore.deck.copyLimit' : 'explore.deck.copyError');
      return;
    }

    await this.router.navigate(['/decks', copyId]);
  }
}
