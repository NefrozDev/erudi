import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { signInUrl } from '../../../core/auth/auth-api';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { Plic } from '../../../shared/ui/plic/plic';

/**
 * Screen 5. Erudi signs in with the Synapse account, shared by every Synapse Engineering
 * app: the button opens its pages, which come back to Erudi signed in.
 */
@Component({
  selector: 'app-sign-in',
  imports: [Plic, TranslocoPipe],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  private readonly location = inject(BROWSER_LOCATION);
  private readonly transloco = inject(TranslocoService);

  /** ?signIn=cancelled|failed: how the last sign-in came back. */
  readonly signIn = input<string>();

  protected readonly leaving = signal(false);
  protected readonly notice = computed(() => {
    switch (this.signIn()) {
      case 'cancelled':
        return 'auth.signIn.cancelled';
      case 'failed':
        return 'auth.signIn.failed';
      default:
        return null;
    }
  });

  protected start(): void {
    this.leaving.set(true);
    this.location.assign(signInUrl('/', this.transloco.getActiveLang()));
  }
}
