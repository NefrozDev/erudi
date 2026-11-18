import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, form, maxLength, pattern, required } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { CardContent, DecksApi } from '../../../core/decks/decks-api';
import { SubmitOnEnter } from '../../../shared/forms/submit-on-enter';
import { visibleError } from '../../../shared/forms/field-errors';
import { CARD_SIDE_MAX_LENGTH, NOT_BLANK } from '../../decks/deck-rules';

/**
 * Fixes a card's text during a session, in a modal dialog over the card: a typo should not
 * wait for the end of the session. The card keeps its box. Escape or "Annuler" closes it
 * without saving; the browser gives the focus back to the button that opened it.
 */
@Component({
  selector: 'app-card-quick-edit',
  imports: [FormField, FormRoot, SubmitOnEnter, TranslocoPipe],
  templateUrl: './card-quick-edit.html',
  styleUrl: './card-quick-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardQuickEdit {
  private readonly api = inject(DecksApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly cardId = input.required<string>();
  readonly content = input.required<CardContent>();

  /** The text as saved. */
  readonly saved = output<CardContent>();
  /** Closed without saving. */
  readonly closed = output<void>();

  protected readonly formError = signal<string | null>(null);
  protected readonly visibleError = visibleError;
  private saving = false;

  private readonly model = linkedSignal<CardContent>(() => ({ ...this.content() }));

  protected readonly form = form(
    this.model,
    (path) => {
      for (const side of [path.front, path.back]) {
        required(side, { message: 'common.required' });
        pattern(side, NOT_BLANK, { message: 'common.required' });
        maxLength(side, CARD_SIDE_MAX_LENGTH, { message: 'cards.sideTooLong' });
      }
    },
    { submission: { action: () => this.save() } },
  );

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected cancel(): void {
    this.dialog().nativeElement.close();
  }

  /** Escape, "Annuler" or a successful save: the dialog's own close event. */
  protected onClose(): void {
    if (!this.saving) {
      this.closed.emit();
    }
  }

  private async save(): Promise<void> {
    this.formError.set(null);
    const content = this.model();
    try {
      const card = await firstValueFrom(this.api.updateCard(this.cardId(), content));
      // The close event follows synchronously: it must not also report a cancellation.
      this.saving = true;
      this.dialog().nativeElement.close();
      this.saved.emit({ front: card.front, back: card.back });
    } catch (error) {
      this.formError.set(httpStatus(error) === 404 ? 'study.edit.gone' : 'common.saveError');
    }
  }
}
