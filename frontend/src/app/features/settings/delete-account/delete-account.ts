import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  FieldTree,
  FormField,
  FormRoot,
  TreeValidationResult,
  form,
  required,
} from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { httpStatus, problemFields } from '../../../core/api/api-errors';
import { AuthStore } from '../../../core/auth/auth-store';
import { visibleError } from '../../../shared/forms/field-errors';
import { Plic } from '../../../shared/ui/plic/plic';

interface DeletionModel {
  password: string;
}

/** "Supprimer mon compte" of screen 17: says what goes, then asks for the password. */
@Component({
  selector: 'app-delete-account',
  imports: [FormField, FormRoot, Plic, RouterLink, TranslocoPipe],
  templateUrl: './delete-account.html',
  styleUrl: './delete-account.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccount {
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);

  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly deleted = signal(false);

  private readonly model = signal<DeletionModel>({ password: '' });

  protected readonly form = form(
    this.model,
    (path) => required(path.password, { message: 'common.required' }),
    { submission: { action: (root) => this.delete(root) } },
  );

  private readonly doneTitle = viewChild<ElementRef<HTMLElement>>('doneTitle');

  private async delete(root: FieldTree<DeletionModel>): Promise<TreeValidationResult> {
    this.formError.set(null);
    try {
      await this.auth.deleteAccount(this.model().password);
    } catch (error) {
      return this.explain(error, root);
    }

    // Signed out, but still on this page until the learner leaves it.
    this.deleted.set(true);
    afterNextRender(() => this.doneTitle()?.nativeElement.focus(), { injector: this.injector });
    return null;
  }

  private explain(error: unknown, root: FieldTree<DeletionModel>): TreeValidationResult {
    const status = httpStatus(error);
    if (status === 400 && problemFields(error).includes('password')) {
      return {
        kind: 'wrongPassword',
        message: 'settings.delete.wrongPassword',
        fieldTree: root.password,
      };
    }

    // A 401 means the session already ended: the interceptor opened the sign-in screen.
    if (status !== 401) {
      this.formError.set(status === 429 ? 'auth.errors.tooManyAttempts' : 'settings.delete.error');
    }
    return null;
  }
}
