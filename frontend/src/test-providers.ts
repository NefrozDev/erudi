import { importProvidersFrom } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import fr from './i18n/fr.json';

/**
 * Added to every TestBed (angular.json `providersFile`): specs render the French texts
 * synchronously, so their assertions read like the app.
 */
export default [
  importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { fr },
      translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
      preloadLangs: true,
    }),
  ),
];
