import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FieldTree,
  FormField,
  FormRoot,
  TreeValidationResult,
  ValidationError,
  email,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  validate,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { httpStatus, problemFields } from '../../../core/api/api-errors';
import { AuthStore } from '../../../core/auth/auth-store';
import { OnboardingState } from '../../../core/onboarding/onboarding-state';
import { visibleError } from '../../../shared/forms/field-errors';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from '../auth-rules';

interface SignUpModel {
  username: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

/** Screen 4. */
@Component({
  selector: 'app-sign-up',
  imports: [FormField, FormRoot, RouterLink, TranslocoPipe],
  templateUrl: './sign-up.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUp {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingState);

  /** A failure about the whole form, kept apart so the same values can be sent again. */
  protected readonly formError = signal<string | null>(null);
  protected readonly visibleError = visibleError;

  private readonly model = signal<SignUpModel>({
    username: '',
    email: '',
    password: '',
    acceptedTerms: false,
  });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.username, { message: 'auth.errors.required' });
      pattern(path.username, USERNAME_PATTERN, { message: 'auth.errors.usernameFormat' });
      required(path.email, { message: 'auth.errors.required' });
      email(path.email, { message: 'auth.errors.email' });
      required(path.password, { message: 'auth.errors.required' });
      minLength(path.password, PASSWORD_MIN_LENGTH, { message: 'auth.errors.passwordLength' });
      maxLength(path.password, PASSWORD_MAX_LENGTH, { message: 'auth.errors.passwordTooLong' });
      validate(path.acceptedTerms, ({ value }) =>
        value() ? null : { kind: 'terms', message: 'auth.errors.terms' },
      );
    },
    { submission: { action: (root) => this.submit(root) } },
  );

  private async submit(root: FieldTree<SignUpModel>): Promise<TreeValidationResult> {
    this.formError.set(null);
    // No trimming needed: the username pattern refuses spaces, and an email input strips them.
    try {
      await this.auth.signUp(this.model());
    } catch (error) {
      return this.explain(error, root);
    }

    this.onboarding.markIntroSeen();
    await this.router.navigateByUrl('/');
    return null;
  }

  private explain(error: unknown, root: FieldTree<SignUpModel>): TreeValidationResult {
    const status = httpStatus(error);

    if (status === 409) {
      const taken: ValidationError.WithOptionalFieldTree[] = [];
      const fields = problemFields(error);
      if (fields.includes('username')) {
        taken.push({
          kind: 'taken',
          message: 'auth.errors.usernameTaken',
          fieldTree: root.username,
        });
      }
      if (fields.includes('email')) {
        taken.push({ kind: 'taken', message: 'auth.errors.emailTaken', fieldTree: root.email });
      }
      if (taken.length > 0) {
        return taken;
      }
    }

    this.formError.set(status === 429 ? 'auth.errors.tooManyAttempts' : 'auth.errors.generic');
    return null;
  }
}
