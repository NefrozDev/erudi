import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DayActivity, StudyApi, StudyStats } from '../../core/study/study-api';
import { countKey } from '../../shared/i18n/count-key';
import { Badge, badgesOf } from './badges';

interface BoxRow {
  number: number;
  count: number;
  countKey: string;
}

interface DayBar {
  day: string;
  /** One letter under the bar. */
  initial: string;
  /** The whole date, for screen readers. */
  label: string;
  reviews: number;
  known: number;
  /** Height, 0 to 100, relative to the busiest day. */
  percent: number;
  /** The share of known answers in the bar, 0 to 100. */
  knownPercent: number;
  /** Translation key of the day's count. */
  countKey: string;
}

/**
 * Screen 13: the learner's whole progress. Their streak, totals and success rate, the last
 * 14 days of answers, each Leitner box (with practice on that box) and the badges earned.
 * Each deck's own figures are on its page.
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
  private readonly transloco = inject(TranslocoService);

  protected readonly summary = rxResource({ stream: () => this.api.summary() });
  protected readonly stats = rxResource({ stream: () => this.api.stats() });

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

  protected readonly streakKey = computed(() =>
    countKey('progress.streak.days', this.stats.hasValue() ? this.stats.value().currentStreak : 0),
  );
  protected readonly bestKey = computed(() =>
    countKey('progress.streak.best', this.stats.hasValue() ? this.stats.value().bestStreak : 0),
  );
  protected readonly streakMessageKey = computed(() =>
    this.stats.hasValue() ? streakMessage(this.stats.value()) : '',
  );
  protected readonly days = computed<DayBar[]>(() =>
    this.stats.hasValue()
      ? toBars(this.stats.value().lastDays, this.transloco.getActiveLang())
      : [],
  );
  protected readonly weekTotal = computed(() =>
    this.days()
      .slice(-7)
      .reduce((sum, day) => sum + day.reviews, 0),
  );
  protected readonly weekKey = computed(() => countKey('progress.activity.week', this.weekTotal()));
  protected readonly badges = computed<Badge[]>(() =>
    this.stats.hasValue() ? badgesOf(this.stats.value()) : [],
  );
  protected readonly earnedCount = computed(() => this.badges().filter((b) => b.earned).length);
  protected readonly numberFormat = computed(
    () => new Intl.NumberFormat(this.transloco.getActiveLang()),
  );
}

function streakMessage({ currentStreak, studiedToday }: StudyStats): string {
  if (currentStreak === 0) {
    return 'progress.streak.start';
  }
  return studiedToday ? 'progress.streak.done' : 'progress.streak.keep';
}

function toBars(days: DayActivity[], locale: string): DayBar[] {
  const busiest = Math.max(1, ...days.map((day) => day.reviews));
  const initial = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return days.map(({ day, reviews, known }) => {
    // A calendar day, not an instant: built in the device's time zone, not parsed as UTC.
    const [year, month, date] = day.split('-').map(Number);
    const local = new Date(year, month - 1, date);
    return {
      day,
      initial: initial.format(local),
      label: long.format(local),
      reviews,
      known,
      percent: Math.round((100 * reviews) / busiest),
      knownPercent: reviews === 0 ? 0 : Math.round((100 * known) / reviews),
      countKey: countKey('progress.activity.day', reviews),
    };
  });
}
