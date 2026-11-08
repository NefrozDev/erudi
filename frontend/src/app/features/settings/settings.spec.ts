import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { buttonNamed, linkNamed, settle, textOf } from '../../../testing/dom';
import { AuthUser } from '../../core/auth/auth-api';
import { AuthStore } from '../../core/auth/auth-store';
import { SYNAPSE_ACCOUNT_URL } from '../../core/auth/synapse-account';
import { BROWSER_LOCATION } from '../../core/browser/browser-location';
import { Settings } from './settings';

describe('Settings', () => {
  const user = signal<AuthUser | null>({
    id: '1',
    username: 'chloe',
    email: 'chloe@example.be',
    termsAccepted: true,
  });
  const signOut = vi.fn<() => Promise<string | null>>();
  const assign = vi.fn<(url: string) => void>();
  let fixture: ComponentFixture<Settings>;
  let host: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    signOut.mockReset().mockResolvedValue('https://auth.example/oidc/session/end');
    assign.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user, signOut } },
        { provide: BROWSER_LOCATION, useValue: { assign } },
        { provide: SYNAPSE_ACCOUNT_URL, useValue: 'https://auth.example/account' },
      ],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Settings);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('should show the account e-mail', () => {
    expect(textOf(host, 'h1')).toBe('Réglages');
    expect(textOf(host, 'dt')).toBe('Compte');
    expect(textOf(host, 'dd')).toBe('chloe@example.be');
  });

  it('should open the terms, and the Synapse account in a new tab for the rest (screen 17)', () => {
    expect(linkNamed(host, "Conditions d'utilisation").getAttribute('href')).toBe('/terms');
    const account = linkNamed(host, 'Gérer mon compte Synapse');
    expect(account.getAttribute('href')).toBe('https://auth.example/account');
    expect(account.target).toBe('_blank');
    expect(account.rel).toBe('noopener');
    expect(textOf(host, '#settings-account-hint')).toContain('suppression du compte');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('should end the Erudi session, then let the identity service sign out everywhere', async () => {
    buttonNamed(host, 'Se déconnecter').click();
    await settle(fixture);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledExactlyOnceWith('https://auth.example/oidc/session/end');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('should open the sign-in screen when there is no identity sign-out to follow', async () => {
    signOut.mockResolvedValue(null);

    buttonNamed(host, 'Se déconnecter').click();
    await settle(fixture);

    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sign-in');
    expect(assign).not.toHaveBeenCalled();
  });

  it('should disable the button while signing out, and leave only once it is done', async () => {
    let finish!: (url: string) => void;
    signOut.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));

    buttonNamed(host, 'Se déconnecter').click();
    await settle(fixture);
    expect(buttonNamed(host, 'Se déconnecter').disabled).toBe(true);
    expect(assign).not.toHaveBeenCalled();

    finish('https://auth.example/oidc/session/end');
    await settle(fixture);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});
