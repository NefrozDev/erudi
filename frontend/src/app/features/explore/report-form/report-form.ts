import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, form, maxLength, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { ExploreApi, ReportReason } from '../../../core/explore/explore-api';
import { visibleError } from '../../../shared/forms/field-errors';
import { Plic } from '../../../shared/ui/plic/plic';
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from '../explore-rules';

/** Reports a public deck for moderation, with a reason (the "Signaler ce paquet" of screen 15). */
@Component({
  selector: 'app-report-form',
  imports: [FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './report-form.html',
  styleUrl: './report-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportForm {
  private readonly api = inject(ExploreApi);
  private readonly injector = inject(Injector);

  /** From the route (`explore/:deckId/report`). */
  readonly deckId = input.required<string>();

  protected readonly reasons = REPORT_REASONS;
  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly sent = signal(false);

  private readonly model = signal<{ reason: ReportReason | ''; details: string }>({
    reason: '',
    details: '',
  });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.reason, { message: 'explore.report.reasonRequired' });
      maxLength(path.details, REPORT_DETAILS_MAX_LENGTH, {
        message: 'explore.report.detailsTooLong',
      });
    },
    { submission: { action: () => this.send() } },
  );

  private readonly sentTitle = viewChild<ElementRef<HTMLElement>>('sentTitle');

  private async send(): Promise<void> {
    this.formError.set(null);
    const { reason, details } = this.model();
    if (reason === '') {
      return;
    }

    try {
      await firstValueFrom(this.api.report(this.deckId(), reason, details.trim()));
    } catch (error) {
      this.formError.set(
        httpStatus(error) === 404 ? 'explore.notFoundText' : 'explore.report.error',
      );
      return;
    }

    this.sent.set(true);
    // The form is gone: screen readers go on with the thanks.
    afterNextRender(() => this.sentTitle()?.nativeElement.focus(), { injector: this.injector });
  }
}
