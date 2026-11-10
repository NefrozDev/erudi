import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';

@Component({ template: '<h1>Accueil</h1><input aria-label="Recherche" />' })
class FirstScreen {}

@Component({ template: '<h1>Explorer</h1><input aria-label="Recherche" />' })
class SecondScreen {}

@Component({ template: '<p>Pas de titre</p>' })
class NoHeading {}

/** A screen whose heading comes with its data, like most of Erudi's. */
@Component({
  template: `<button type="button">Retour</button>
    @if (loaded()) {
      <h1>Paquet</h1>
    }`,
})
class LoadingScreen {
  static readonly loaded = signal(false);
  protected readonly loaded = LoadingScreen.loaded;
}

describe('App', () => {
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'first', component: FirstScreen },
          { path: 'second', component: SecondScreen },
          { path: 'none', component: NoHeading },
          { path: 'loading', component: LoadingScreen },
        ]),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    LoadingScreen.loaded.set(false);
  });

  async function render() {
    const fixture = TestBed.createComponent(App);
    const host = fixture.nativeElement as HTMLElement;
    const go = async (url: string) => {
      await router.navigateByUrl(url);
      await fixture.whenStable();
    };
    return { fixture, host, go };
  }

  it('should render only the router outlet as the shell', async () => {
    const { fixture, host } = await render();
    await fixture.whenStable();

    expect(host.querySelector('router-outlet')).not.toBeNull();
    expect(host.children).toHaveLength(1);
  });

  it('should leave focus alone on the first screen', async () => {
    const { host, go } = await render();

    await go('/first');

    expect(host.querySelector('h1')?.textContent).toBe('Accueil');
    expect(document.activeElement).toBe(document.body);
  });

  it("should move focus to the new screen's heading, without making it tabbable", async () => {
    const { host, go } = await render();
    await go('/first');

    await go('/second');

    const heading = host.querySelector('h1');
    expect(heading?.textContent).toBe('Explorer');
    expect(document.activeElement).toBe(heading);
    expect(heading?.tabIndex).toBe(-1);
  });

  it('should keep focus where it is when only the query string changes', async () => {
    const { host, go } = await render();
    await go('/first');
    await go('/second');
    const search = host.querySelector('input') as HTMLInputElement;
    search.focus();

    await go('/second?q=capitales');

    expect(document.activeElement).toBe(search);
  });

  it('should wait for a heading that comes with the data', async () => {
    const { fixture, host, go } = await render();
    await go('/first');
    await go('/loading');
    expect(document.activeElement).toBe(document.body);

    LoadingScreen.loaded.set(true);
    await fixture.whenStable();

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('should not take focus from where the user put it while waiting', async () => {
    const { fixture, host, go } = await render();
    await go('/first');
    await go('/loading');
    const back = host.querySelector('button') as HTMLButtonElement;
    back.focus();

    LoadingScreen.loaded.set(true);
    await fixture.whenStable();

    expect(document.activeElement).toBe(back);
  });

  it('should do nothing on a screen without a heading', async () => {
    const { go } = await render();
    await go('/first');

    await go('/none');

    expect(document.activeElement).toBe(document.body);
  });
});
