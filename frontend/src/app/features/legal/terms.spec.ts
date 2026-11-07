import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buttonNamed, query, textOf } from '../../../testing/dom';
import { Terms } from './terms';

@Component({ template: '' })
class Elsewhere {}

describe('Terms', () => {
  let harness: RouterTestingHarness;
  let host: HTMLElement;
  let back: ReturnType<typeof vi.spyOn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'terms', component: Terms },
          { path: 'settings', component: Elsewhere },
        ]),
      ],
    });
    back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
    harness = await RouterTestingHarness.create();
  });

  async function open(...urls: string[]): Promise<void> {
    for (const url of urls) {
      await harness.navigateByUrl(url);
    }
    host = harness.routeNativeElement as HTMLElement;
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  }

  it('should show the terms and privacy policy with their date', async () => {
    await open('/terms');

    expect(textOf(host, 'h1')).toBe("Conditions d'utilisation et confidentialité");
    expect(textOf(host, 'header .subtitle')).toBe('Dernière mise à jour : 7 novembre 2026');
    expect([...host.querySelectorAll('h2')].map((title) => title.textContent?.trim())).toEqual([
      '1. Erudi',
      '2. Ton compte',
      "3. Tes paquets et l'Explorer",
      '4. Règles de conduite',
      '5. Le service',
      '6. Supprimer ton compte',
      '7. Politique de confidentialité',
      '8. Modifications',
      '9. Droit applicable',
    ]);
  });

  it('should give the contact and the data protection authority', async () => {
    await open('/terms');

    const contact = query<HTMLAnchorElement>(host, 'a[href^="mailto:"]');
    expect(contact.getAttribute('href')).toBe('mailto:contact@synapseengineering.dev');
    expect(contact.textContent?.trim()).toBe('contact@synapseengineering.dev');
    const authority = query<HTMLAnchorElement>(host, '#privacy a');
    expect(authority.href).toBe('https://www.autoriteprotectiondonnees.be/');
    expect(authority.target).toBe('_blank');
    expect(authority.rel).toBe('noopener');
  });

  it('should state the facts the app and its deployment must keep true', async () => {
    await open('/terms');

    const text = host.textContent ?? '';
    expect(text).toContain('pendant 30 jours au plus');
    expect(text).toContain('valables 30 minutes');
    expect(text).toContain('14 jours au plus');
    expect(text).toContain('aucun traceur ni service tiers');
    expect(text).toContain('OVHcloud');
  });

  it('should go back to the screen that opened it', async () => {
    await open('/settings', '/terms');

    buttonNamed(host, 'Retour').click();

    expect(back).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('should open the app when the terms were opened on their own', async () => {
    await open('/terms');

    buttonNamed(host, 'Retour').click();

    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/');
    expect(back).not.toHaveBeenCalled();
  });
});
