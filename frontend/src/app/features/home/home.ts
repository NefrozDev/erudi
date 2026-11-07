import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth-store';
import { Deck, DecksApi } from '../../core/decks/decks-api';
import { StudyApi, StudySummary } from '../../core/study/study-api';
import { countKey } from '../../shared/i18n/count-key';
import { BoxMeter } from '../../shared/ui/box-meter/box-meter';
import { Plic } from '../../shared/ui/plic/plic';

type DeckTone = 'violet' | 'yellow' | 'mint' | 'coral';

const TONES: readonly DeckTone[] = ['violet', 'yellow', 'mint', 'coral'];

interface DailyGoal {
  reviewed: number;
  /** Today's answers plus the cards still due. */
  goal: number;
  due: number;
  percent: number;
  progressKey: string;
  /** Without anything due: the day is done, or there was nothing to do. */
  restKey: string;
  startKey: string;
}

interface DeckRow {
  id: string;
  name: string;
  initial: string;
  tone: DeckTone;
  statusKey: string;
  dueCount: number;
  level: number;
}

/** Screen 7: the daily goal, which starts the quiz, and the learner's decks. */
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
  private readonly studyApi = inject(StudyApi);

  protected readonly username = computed(() => this.auth.user()?.username ?? '');
  protected readonly decks = rxResource({ stream: () => this.decksApi.list() });
  // Not critical: without it the goal card stays hidden, and the decks still lead to a quiz.
  protected readonly summary = rxResource({ stream: () => this.studyApi.summary() });
  protected readonly goal = computed(() =>
    this.summary.hasValue() ? toGoal(this.summary.value()) : null,
  );
  protected readonly rows = computed(() =>
    this.decks.hasValue() ? this.decks.value().map(toRow) : [],
  );
}

/** Hidden until there are cards: the deck list explains how to start. */
function toGoal({ reviewedToday, dueCount, boxes }: StudySummary): DailyGoal | null {
  if (boxes.every((count) => count === 0)) {
    return null;
  }

  const goal = reviewedToday + dueCount;
  return {
    reviewed: reviewedToday,
    goal,
    due: dueCount,
    percent: goal === 0 ? 0 : Math.round((100 * reviewedToday) / goal),
    progressKey: countKey('home.goal.progress', goal),
    restKey: reviewedToday > 0 ? 'home.goal.allDone' : 'home.goal.nothingDue',
    startKey: reviewedToday > 0 ? 'home.goal.continue' : 'home.goal.start',
  };
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
