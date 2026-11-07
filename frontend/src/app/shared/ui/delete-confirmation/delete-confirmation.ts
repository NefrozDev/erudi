import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * A delete link that asks before acting: the first click shows the question, and only the
 * second button emits `confirmed`. Texts come translated from the parent.
 */
@Component({
  selector: 'app-delete-confirmation',
  template: `
    @if (asking()) {
      <p role="alert">{{ question() }}</p>
      <button
        type="button"
        class="button delete-confirmation__confirm"
        [disabled]="busy()"
        (click)="confirmed.emit()"
      >
        {{ confirmLabel() }}
      </button>
      <button type="button" class="text-link" [disabled]="busy()" (click)="asking.set(false)">
        {{ keepLabel() }}
      </button>
    } @else {
      <button type="button" class="text-link text-link--danger" (click)="asking.set(true)">
        {{ label() }}
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .delete-confirmation__confirm {
      border-color: var(--color-danger);
      background: var(--color-danger);

      &:hover:not(:disabled) {
        border-color: var(--color-danger);
        background: var(--color-danger);
        filter: brightness(0.9);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteConfirmation {
  readonly label = input.required<string>();
  readonly question = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly keepLabel = input.required<string>();
  /** Disables both buttons while the deletion runs. */
  readonly busy = input(false);

  readonly confirmed = output<void>();

  protected readonly asking = signal(false);
}
