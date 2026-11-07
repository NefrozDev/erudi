import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/** Change it with any change to the terms (`terms` in the translations). */
export const TERMS_UPDATED_ON = '2026-11-07';
export const CONTACT_EMAIL = 'contact@synapseengineering.dev';
export const DATA_PROTECTION_AUTHORITY_URL = 'https://www.autoriteprotectiondonnees.be';

/**
 * The terms of use and privacy policy, public so they can be read before signing up. Facts
 * they state (30-day session cookie, 30-minute reset links, 14-day backups, no third-party
 * service, OVHcloud hosting) must stay true when the app or its deployment changes.
 */
@Component({
  selector: 'app-terms',
  imports: [TranslocoPipe],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Terms {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly contact = CONTACT_EMAIL;
  protected readonly authorityUrl = DATA_PROTECTION_AUTHORITY_URL;
  protected readonly updatedOn = new Intl.DateTimeFormat(inject(TranslocoService).getActiveLang(), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(TERMS_UPDATED_ON));

  /** Back where the learner came from in the app, or to the start when the page was opened on its own. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
      this.location.back();
    } else {
      void this.router.navigateByUrl('/');
    }
  }
}
