import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, settle, textOf, typeInto } from '../../../../testing/dom';
import { AuthApi } from '../../../core/auth/auth-api';
import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  const requestPasswordReset = vi.fn<(email: string) => Observable<void>>();
  let fixture: ComponentFixture<ForgotPassword>;
  let host: HTMLElement;

  beforeEach(async () => {
    requestPasswordReset.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthApi, useValue: { requestPasswordReset } }],
    });
    fixture = TestBed.createComponent(ForgotPassword);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function submitWith(email: string): Promise<void> {
    typeInto(host, '#forgot-password-email', email);
    buttonNamed(host, 'Envoyer le lien').click();
    await settle(fixture);
  }

  it('should show the form of screen 6 with a way back', () => {
    expect(textOf(host, 'h1')).toBe('Mot de passe oublié');
    expect(linkNamed(host, 'Connexion').getAttribute('href')).toBe('/sign-in');
  });

  it('should check the address before sending', async () => {
    await submitWith('not-an-email');

    expect(textOf(host, '#forgot-password-email-error')).toBe('Saisis une adresse email valide.');
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('should send the link and confirm it, without saying whether the account exists', async () => {
    await submitWith(' chloe@example.be ');

    expect(requestPasswordReset).toHaveBeenCalledExactlyOnceWith('chloe@example.be');
    expect(textOf(host, 'h1')).toBe('Vérifie ta boîte mail');
    expect(textOf(host, '[role="status"] .subtitle')).toBe(
      'Si un compte existe pour chloe@example.be, tu vas recevoir un lien valable 30 minutes.',
    );
    expect(linkNamed(host, 'Retour à la connexion').getAttribute('href')).toBe('/sign-in');
    expect(host.querySelector('form')).toBeNull();
  });

  it.each([
    [429, 'Trop de tentatives. Réessaie dans une minute.'],
    [500, 'Une erreur est survenue. Réessaie dans un instant.'],
  ])('should keep the form and explain a %s answer', async (status, message) => {
    requestPasswordReset.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));

    await submitWith('chloe@example.be');

    expect(textOf(host, '[role="alert"]')).toBe(message);
    expect(host.querySelector('form')).not.toBeNull();
  });
});
