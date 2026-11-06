import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, textOf, typeInto } from '../../../../testing/dom';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { ResetPassword } from './reset-password';

describe('ResetPassword', () => {
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
  const confirmPasswordReset = vi.fn<(token: string, password: string) => Observable<void>>();
  const clear = vi.fn();
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    confirmPasswordReset.mockReset().mockReturnValue(of(undefined));
    clear.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'reset-password', component: ResetPassword }]),
        { provide: AuthApi, useValue: { confirmPasswordReset } },
        { provide: AuthStore, useValue: { clear } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  async function open(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url, ResetPassword);
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  async function submit(host: HTMLElement, password: string): Promise<void> {
    typeInto(host, '#reset-password-password', password);
    buttonNamed(host, 'Enregistrer').click();
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
  }

  it.each([
    ['without a token', '/reset-password'],
    ['with a malformed token', '/reset-password#token=short'],
  ])('should say the link is not valid when opened %s, without calling the API', async (_, url) => {
    const host = await open(url);

    expect(textOf(host, 'h1')).toBe('Lien expiré');
    expect(linkNamed(host, 'Demander un nouveau lien').getAttribute('href')).toBe(
      '/forgot-password',
    );
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('should show the form and remove the token from the address bar', async () => {
    const host = await open(`/reset-password#token=${token}`);

    expect(textOf(host, 'h1')).toBe('Nouveau mot de passe');
    expect(TestBed.inject(Router).url).toBe('/reset-password');
  });

  it('should check the new password before sending', async () => {
    const host = await open(`/reset-password#token=${token}`);

    await submit(host, 'short');

    expect(textOf(host, '#reset-password-password-error')).toBe('Au moins 8 caractères.');
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('should change the password, forget the ended session and offer to sign in', async () => {
    const host = await open(`/reset-password#token=${token}`);

    await submit(host, 'a new password');

    expect(confirmPasswordReset).toHaveBeenCalledExactlyOnceWith(token, 'a new password');
    expect(clear).toHaveBeenCalledTimes(1);
    expect(textOf(host, 'h1')).toBe('Mot de passe changé');
    expect(linkNamed(host, 'Se connecter').getAttribute('href')).toBe('/sign-in');
  });

  it('should say the link is not valid when the API refuses it', async () => {
    confirmPasswordReset.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
    const host = await open(`/reset-password#token=${token}`);

    await submit(host, 'a new password');

    expect(textOf(host, 'h1')).toBe('Lien expiré');
    expect(clear).not.toHaveBeenCalled();
  });

  it('should keep the form and ask to wait when rate limited', async () => {
    confirmPasswordReset.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
    const host = await open(`/reset-password#token=${token}`);

    await submit(host, 'a new password');

    expect(textOf(host, '[role="alert"]')).toBe('Trop de tentatives. Réessaie dans une minute.');
    expect(textOf(host, 'h1')).toBe('Nouveau mot de passe');
    expect(clear).not.toHaveBeenCalled();
  });
});
