import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth-store';

/** Screen 17, with the account only for now. */
@Component({
  selector: 'app-settings',
  imports: [TranslocoPipe],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthStore);
  protected readonly signingOut = signal(false);

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
