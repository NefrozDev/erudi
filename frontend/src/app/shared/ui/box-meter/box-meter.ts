import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Five rising bars, filled up to `level` (a box, or a deck's average box). Decorative: the
 * screen says the level in words.
 */
@Component({
  selector: 'app-box-meter',
  template: `
    @for (bar of bars; track bar) {
      <span class="box-meter__bar" [class.box-meter__bar--filled]="bar <= level()"></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: flex-end;
      gap: 4px;
      height: 22px;
    }

    .box-meter__bar {
      width: 8px;
      border-radius: 4px;
      background: var(--color-tile-violet);

      @for $i from 1 through 5 {
        &:nth-child(#{$i}) {
          height: 2px + $i * 4px;
        }
      }
    }

    .box-meter__bar--filled {
      background: var(--color-violet);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class BoxMeter {
  readonly level = input.required<number>();

  protected readonly bars = [1, 2, 3, 4, 5] as const;
}
