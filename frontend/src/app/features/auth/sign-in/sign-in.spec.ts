import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buttonNamed, textOf } from '../../../../testing/dom';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { SignIn } from './sign-in';

describe('SignIn', () => {
  const assign = vi.fn<(url: string) => void>();
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    assign.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'sign-in', component: SignIn }], withComponentInputBinding()),
        { provide: BROWSER_LOCATION, useValue: { assign } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  async function open(url = '/sign-in'): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    return harness.routeNativeElement!;
  }

  it('should explain the Synapse account and offer one way in, with no password field', async () => {
    const host = await open();

    expect(textOf(host, 'h1')).toBe('Bienvenue');
    expect(textOf(host, '.subtitle')).toContain('ton compte Synapse');
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('should send the browser to the API sign-in in the page language, only once', async () => {
    const host = await open();

    buttonNamed(host, 'Se connecter ou créer un compte').click();
    harness.detectChanges();

    expect(assign).toHaveBeenCalledExactlyOnceWith('/api/auth/login?returnTo=%2F&lang=fr');
    expect(buttonNamed(host, 'Redirection…').disabled).toBe(true);
  });

  it.each([
    ['cancelled', 'La connexion a été annulée.'],
    ['failed', 'La connexion a échoué. Réessaie dans un instant.'],
  ])('should say when the last sign-in came back %s', async (outcome, message) => {
    const host = await open(`/sign-in?signIn=${outcome}`);

    expect(textOf(host, '[role="alert"]')).toBe(message);
    expect(assign).not.toHaveBeenCalled();
  });

  it('should ignore an unknown outcome in the address', async () => {
    const host = await open('/sign-in?signIn=%3Cscript%3E');

    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
