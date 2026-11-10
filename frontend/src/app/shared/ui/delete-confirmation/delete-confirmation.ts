import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
  type Signal,
} from '@angular/core';

/**
 * A delete link that asks before acting: the first click shows the question, and only the
 * second button emits `confirmed`. Texts come translated from the parent. The button pressed
 * disappears, so focus moves on with the keyboard user: to "keep", the harmless answer, then
 * back to the link.
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
      <button #keepButton type="button" class="text-link" [disabled]="busy()" (click)="keep()">
        {{ keepLabel() }}
      </button>
    } @else {
      <button #askButton type="button" class="text-link text-link--danger" (click)="ask()">
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

  private readonly injector = inject(Injector);
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keepButton');
  private readonly askButton = viewChild<ElementRef<HTMLButtonElement>>('askButton');

  protected ask(): void {
    this.asking.set(true);
    this.focusOnceRendered(this.keepButton);
  }

  protected keep(): void {
    this.asking.set(false);
    this.focusOnceRendered(this.askButton);
  }

  private focusOnceRendered(button: Signal<ElementRef<HTMLButtonElement> | undefined>): void {
    afterNextRender(() => button()?.nativeElement.focus(), { injector: this.injector });
  }
}
