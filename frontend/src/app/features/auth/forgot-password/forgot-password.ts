import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { AuthApi } from '../../../core/auth/auth-api';
import { visibleError } from '../../../shared/forms/field-errors';
import { Plic } from '../../../shared/ui/plic/plic';

/** Screen 6, with the confirmation the mockup still listed as missing. */
@Component({
  selector: 'app-forgot-password',
  imports: [FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  private readonly api = inject(AuthApi);

  protected readonly formError = signal<string | null>(null);
  /** The address the link was sent to, once sent. */
  protected readonly sentTo = signal<string | null>(null);
  protected readonly visibleError = visibleError;

  private readonly model = signal({ email: '' });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.email, { message: 'auth.errors.required' });
      email(path.email, { message: 'auth.errors.email' });
    },
    { submission: { action: () => this.submit() } },
  );

  private async submit(): Promise<void> {
    this.formError.set(null);
    const address = this.model().email;

    try {
      await firstValueFrom(this.api.requestPasswordReset(address));
      this.sentTo.set(address);
    } catch (error) {
      this.formError.set(
        httpStatus(error) === 429 ? 'auth.errors.tooManyAttempts' : 'auth.errors.generic',
      );
    }
  }
}
