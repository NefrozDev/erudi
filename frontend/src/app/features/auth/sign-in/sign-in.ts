import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { httpStatus } from '../../../core/api/api-errors';
import { AuthStore } from '../../../core/auth/auth-store';
import { visibleError } from '../../../shared/forms/field-errors';
import { Plic } from '../../../shared/ui/plic/plic';

interface SignInModel {
  email: string;
  password: string;
}

/** Screen 5. */
@Component({
  selector: 'app-sign-in',
  imports: [FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly formError = signal<string | null>(null);
  protected readonly visibleError = visibleError;

  private readonly model = signal<SignInModel>({ email: '', password: '' });

  // Only presence is checked: the format of an existing account's e-mail is the API's concern.
  protected readonly form = form(
    this.model,
    (path) => {
      required(path.email, { message: 'auth.errors.required' });
      required(path.password, { message: 'auth.errors.required' });
    },
    { submission: { action: () => this.submit() } },
  );

  private async submit(): Promise<void> {
    this.formError.set(null);
    try {
      // The email input already strips surrounding spaces; the password is sent as typed.
      await this.auth.signIn(this.model());
    } catch (error) {
      this.formError.set(this.explain(error));
      return;
    }

    await this.router.navigateByUrl('/');
  }

  private explain(error: unknown): string {
    switch (httpStatus(error)) {
      case 400:
      case 401:
        return 'auth.errors.invalidCredentials';
      case 429:
        return 'auth.errors.tooManyAttempts';
      default:
        return 'auth.errors.generic';
    }
  }
}
