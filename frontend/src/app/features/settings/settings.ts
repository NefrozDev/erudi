import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth-store';

/** Screen 17: the account, the terms and account deletion for now. */
@Component({
  selector: 'app-settings',
  imports: [RouterLink, TranslocoPipe],
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
