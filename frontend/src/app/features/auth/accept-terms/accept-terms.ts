import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../../core/auth/auth-store';
import { Plic } from '../../../shared/ui/plic/plic';

/**
 * The first screen after a first sign-in: the Synapse account covers signing in, Erudi's
 * own terms cover what Erudi does.
 */
@Component({
  selector: 'app-accept-terms',
  imports: [Plic, RouterLink, TranslocoPipe],
  templateUrl: './accept-terms.html',
  styles: '.accept-terms__plic { align-self: center; --plic-size: 150px; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcceptTerms {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly accepting = signal(false);
  protected readonly failed = signal(false);

  protected async accept(): Promise<void> {
    this.accepting.set(true);
    this.failed.set(false);
    try {
      await this.auth.acceptTerms();
    } catch {
      this.failed.set(true);
      this.accepting.set(false);
      return;
    }
    await this.router.navigateByUrl('/');
  }
}
