import {
  EnvironmentProviders,
  Injectable,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import {
  Translation,
  TranslocoLoader,
  TranslocoService,
  provideTransloco,
} from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export const DEFAULT_LANG = 'fr';

/**
 * Each language file is its own lazy chunk with a hashed name: a deploy that changes
 * translations changes the URL, so browsers never keep stale texts.
 */
@Injectable({ providedIn: 'root' })
export class BundledTranslationLoader implements TranslocoLoader {
  async getTranslation(lang: string): Promise<Translation> {
    const file = (await import(`../../../i18n/${lang}.json`)) as { default: Translation };
    return file.default;
  }
}

/** French only for now; adding a language is adding its JSON file and listing it here. */
export function provideI18n(): EnvironmentProviders[] {
  return [
    ...provideTransloco({
      config: {
        availableLangs: [DEFAULT_LANG],
        defaultLang: DEFAULT_LANG,
        fallbackLang: DEFAULT_LANG,
        reRenderOnLangChange: false,
        prodMode: !isDevMode(),
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
      },
      loader: BundledTranslationLoader,
    }),
    // Loaded before the first screen renders, so keys never flash on screen.
    provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load(DEFAULT_LANG))),
  ];
}
