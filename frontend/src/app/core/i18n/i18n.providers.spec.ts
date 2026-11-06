import { TestBed } from '@angular/core/testing';
import { BundledTranslationLoader } from './i18n.providers';

describe('BundledTranslationLoader', () => {
  it('should load the French texts from the bundled file', async () => {
    const translation = await TestBed.inject(BundledTranslationLoader).getTranslation('fr');

    expect(translation['titles']).toMatchObject({ home: 'Accueil' });
  });
});
