import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth-store';
import { SYNAPSE_ACCOUNT_URL } from '../../core/auth/synapse-account';
import { BROWSER_LOCATION } from '../../core/browser/browser-location';

/**
 * Screen 17: the account and the terms for now. The account itself (username, e-mail,
 * password, deletion) is managed on the Synapse account page.
 */
@Component({
  selector: 'app-settings',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly router = inject(Router);
  private readonly location = inject(BROWSER_LOCATION);

  protected readonly auth = inject(AuthStore);
  protected readonly accountUrl = inject(SYNAPSE_ACCOUNT_URL);
  protected readonly signingOut = signal(false);

  /** Erudi's session ends, then the identity service signs out of every Synapse app. */
  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    const next = await this.auth.signOut();
    if (next) {
      this.location.assign(next);
    } else {
      await this.router.navigateByUrl('/sign-in');
    }
  }
}
