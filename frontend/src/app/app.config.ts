import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideI18n } from './core/i18n/i18n.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Fetch is the default backend since Angular 22: `withFetch()` is no longer needed.
    provideHttpClient(),
    provideI18n(),
  ],
};
