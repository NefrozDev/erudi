import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { StudyApi } from '../../core/study/study-api';
import { countKey } from '../../shared/i18n/count-key';

interface BoxRow {
  number: number;
  count: number;
  countKey: string;
}

/** Screen 13: how many cards each Leitner box holds, and how often it comes back. */
@Component({
  selector: 'app-progress',
  imports: [TranslocoPipe],
  templateUrl: './progress.html',
  styleUrl: './progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Progress {
  private readonly api = inject(StudyApi);

  protected readonly summary = rxResource({ stream: () => this.api.summary() });

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
}
