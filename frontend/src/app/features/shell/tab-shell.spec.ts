import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TabShell } from './tab-shell';

@Component({ template: '<p class="tab-content">tab content</p>' })
class FakeTab {}

describe('TabShell', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: TabShell,
            children: [
              { path: '', pathMatch: 'full', component: FakeTab },
              { path: 'settings', component: FakeTab },
            ],
          },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  async function open(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    return harness.fixture.nativeElement as HTMLElement;
  }

  it('should show the current tab above the four tabs of the bottom bar', async () => {
    const host = await open('/');

    expect(host.querySelector('.tab-content')).not.toBeNull();
    const nav = host.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Navigation principale');
    const links = [...host.querySelectorAll('nav a')].map((link) => [
      link.textContent?.trim(),
      link.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Accueil', '/'],
      ['Explorer', '/explore'],
      ['Progrès', '/progress'],
      ['Réglages', '/settings'],
    ]);
  });

  it.each([
    ['/', 'Accueil'],
    ['/settings', 'Réglages'],
  ])('should mark only the active tab on %s', async (url, label) => {
    const host = await open(url);

    const current = [...host.querySelectorAll('nav a[aria-current="page"]')];
    expect(current.map((link) => link.textContent?.trim())).toEqual([label]);
    expect(current[0].classList).toContain('tab-bar__link--active');
  });
});
