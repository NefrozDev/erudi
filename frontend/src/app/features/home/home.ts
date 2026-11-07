import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth-store';
import { Deck, DecksApi } from '../../core/decks/decks-api';
import { countKey } from '../../shared/i18n/count-key';
import { BoxMeter } from '../../shared/ui/box-meter/box-meter';
import { Plic } from '../../shared/ui/plic/plic';

type DeckTone = 'violet' | 'yellow' | 'mint' | 'coral';

const TONES: readonly DeckTone[] = ['violet', 'yellow', 'mint', 'coral'];

interface DeckRow {
  id: string;
  name: string;
  initial: string;
  tone: DeckTone;
  statusKey: string;
  dueCount: number;
  level: number;
}

/** Screen 7: the learner's decks. */
@Component({
  selector: 'app-home',
  imports: [BoxMeter, Plic, RouterLink, TranslocoPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly auth = inject(AuthStore);
  private readonly decksApi = inject(DecksApi);

  protected readonly username = computed(() => this.auth.user()?.username ?? '');
  protected readonly decks = rxResource({ stream: () => this.decksApi.list() });
  protected readonly rows = computed(() =>
    this.decks.hasValue() ? this.decks.value().map(toRow) : [],
  );
}

function toRow(deck: Deck): DeckRow {
  return {
    id: deck.id,
    name: deck.name,
    // Array.from splits by code point, so a deck named with an emoji keeps it whole.
    initial: (Array.from(deck.name.trim())[0] ?? '?').toLocaleUpperCase('fr'),
    tone: toneOf(deck.id),
    statusKey: statusKey(deck),
    dueCount: deck.dueCount,
    level: deck.level,
  };
}

function statusKey(deck: Deck): string {
  if (deck.cardCount === 0) {
    return 'home.deckStatus.empty';
  }
  return deck.dueCount === 0
    ? 'home.deckStatus.upToDate'
    : countKey('home.deckStatus.due', deck.dueCount);
}

/** Derived from the id, so a deck keeps its colour when others are added or removed. */
function toneOf(id: string): DeckTone {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
