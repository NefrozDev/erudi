import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth-store';
import { sessionExpiryInterceptor } from './core/auth/session-expiry.interceptor';
import { provideI18n } from './core/i18n/i18n.providers';
import { TranslatedTitleStrategy } from './core/i18n/translated-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Fetch is the default backend since Angular 22: `withFetch()` is no longer needed.
    provideHttpClient(withInterceptors([sessionExpiryInterceptor])),
    provideI18n(),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    // The guards read the user synchronously, so the session is known before the first route.
    provideAppInitializer(() => inject(AuthStore).restore()),
  ],
};
