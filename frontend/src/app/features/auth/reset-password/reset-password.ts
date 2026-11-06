import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, minLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { visibleError } from '../../../shared/forms/field-errors';
import { Plic } from '../../../shared/ui/plic/plic';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, RESET_TOKEN_PATTERN } from '../auth-rules';

type ResetStep = 'form' | 'done' | 'invalid';

/** Opened from the e-mailed link, whose fragment carries the token: `#token=…`. */
@Component({
  selector: 'app-reset-password',
  imports: [FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPassword implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private token = '';

  protected readonly step = signal<ResetStep>('form');
  protected readonly formError = signal<string | null>(null);
  protected readonly visibleError = visibleError;

  private readonly model = signal({ password: '' });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.password, { message: 'auth.errors.required' });
      minLength(path.password, PASSWORD_MIN_LENGTH, { message: 'auth.errors.passwordLength' });
      maxLength(path.password, PASSWORD_MAX_LENGTH, { message: 'auth.errors.passwordTooLong' });
    },
    { submission: { action: () => this.submit() } },
  );

  ngOnInit(): void {
    const fragment = this.route.snapshot.fragment ?? '';
    this.token = new URLSearchParams(fragment).get('token') ?? '';

    if (!RESET_TOKEN_PATTERN.test(this.token)) {
      this.step.set('invalid');
      return;
    }

    // Keeps the token out of the address bar and the browser history once read.
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true });
  }

  private async submit(): Promise<void> {
    this.formError.set(null);

    try {
      await firstValueFrom(this.api.confirmPasswordReset(this.token, this.model().password));
    } catch (error) {
      const status = httpStatus(error);
      if (status === 400) {
        this.step.set('invalid');
      } else {
        this.formError.set(status === 429 ? 'auth.errors.tooManyAttempts' : 'auth.errors.generic');
      }
      return;
    }

    // The API ended every session of the account, this device's included.
    this.auth.clear();
    this.step.set('done');
  }
}
