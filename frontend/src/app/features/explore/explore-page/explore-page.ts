import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { switchMap, timer } from 'rxjs';
import { DeckCategory, ExploreApi, PublicDeckSummary } from '../../../core/explore/explore-api';
import { countKey } from '../../../shared/i18n/count-key';
import { Plic } from '../../../shared/ui/plic/plic';
import { DECK_CATEGORIES, SEARCH_MAX_LENGTH, toDeckCategory } from '../explore-rules';

/** Waits for a pause in typing, so a word is searched once rather than letter by letter. */
export const SEARCH_DELAY_MS = 300;

interface CategoryChip {
  value: DeckCategory | undefined;
  label: string;
}

interface DeckRow extends PublicDeckSummary {
  cardsKey: string;
  usesKey: string;
  /** The counts written the learner's way ("2 300"). */
  cards: string;
  uses: string;
}

const CHIPS: readonly CategoryChip[] = [
  { value: undefined, label: 'explore.all' },
  ...DECK_CATEGORIES.map((value) => ({ value, label: `explore.categories.${value}` })),
];

/**
 * Screen 14: the public decks, the most used first, narrowed by a search and a category. Both
 * live in the address (`?q=&category=`), so "back" from a deck finds the same list.
 */
@Component({
  selector: 'app-explore-page',
  imports: [Plic, RouterLink, TranslocoPipe],
  templateUrl: './explore-page.html',
  styleUrl: './explore-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorePage implements OnInit {
  private readonly api = inject(ExploreApi);
  private readonly router = inject(Router);
  private readonly numbers = new Intl.NumberFormat(inject(TranslocoService).getActiveLang());

  /** From the query string. */
  readonly q = input<string>();
  readonly category = input<string>();

  protected readonly chips = CHIPS;
  protected readonly searchMaxLength = SEARCH_MAX_LENGTH;
  protected readonly selectedCategory = computed(() => toDeckCategory(this.category()));

  /**
   * What the field shows. Only typing changes it: following the address while typing would
   * put back an older text when a navigation finishes after a quick keystroke.
   */
  protected readonly text = signal('');

  protected readonly decks = rxResource({
    params: () => ({ text: this.text().trim(), category: this.selectedCategory() }),
    // A new keystroke cancels the wait, so only the last text is searched.
    stream: ({ params }) =>
      timer(params.text ? SEARCH_DELAY_MS : 0).pipe(switchMap(() => this.api.search(params))),
  });

  /** The previous results stay on screen while the next ones load. */
  private readonly shown = linkedSignal<
    PublicDeckSummary[] | undefined,
    PublicDeckSummary[] | undefined
  >({
    source: () => (this.decks.hasValue() ? this.decks.value() : undefined),
    computation: (decks, previous) => decks ?? previous?.value,
  });

  protected readonly rows = computed(() =>
    this.shown()?.map((deck): DeckRow => ({
      ...deck,
      cardsKey: countKey('decks.cards', deck.cardCount),
      usesKey: countKey('explore.uses', deck.useCount),
      cards: this.numbers.format(deck.cardCount),
      uses: this.numbers.format(deck.useCount),
    })),
  );
  protected readonly filtering = computed(
    () => this.text().trim() !== '' || this.selectedCategory() !== undefined,
  );

  ngOnInit(): void {
    this.text.set(this.q() ?? '');
  }

  protected onType(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    void this.updateAddress({ q: text.trim() || null });
  }

  protected choose(category: DeckCategory | undefined): void {
    void this.updateAddress({ category: category ?? null });
  }

  private updateAddress(queryParams: Record<string, string | null>): Promise<boolean> {
    // Replaces the entry: a search does not fill the history with one step per letter.
    return this.router.navigate(['/explore'], {
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
