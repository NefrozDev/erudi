import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { buttonNamed, linkNamed, settle, textOf, typeInto } from '../../../../testing/dom';
import { SignInRequest } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { SignIn } from './sign-in';

describe('SignIn', () => {
  const signIn = vi.fn<(request: SignInRequest) => Promise<void>>();
  let fixture: ComponentFixture<SignIn>;
  let host: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    signIn.mockReset().mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { signIn } }],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(SignIn);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function submitWith(email: string, password: string): Promise<void> {
    typeInto(host, '#sign-in-email', email);
    typeInto(host, '#sign-in-password', password);
    buttonNamed(host, 'Se connecter').click();
    await settle(fixture);
  }

  it('should link to password recovery and to sign-up', () => {
    expect(textOf(host, 'h1')).toBe('Bienvenue');
    expect(linkNamed(host, 'Mot de passe oublié ?').getAttribute('href')).toBe('/forgot-password');
    expect(linkNamed(host, 'Créer un compte').getAttribute('href')).toBe('/sign-up');
  });

  it('should require both fields and send nothing', async () => {
    await submitWith('', '');

    expect(textOf(host, '#sign-in-email-error')).toBe('Ce champ est obligatoire.');
    expect(textOf(host, '#sign-in-password-error')).toBe('Ce champ est obligatoire.');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('should sign in without the spaces around the e-mail but with the password as typed', async () => {
    await submitWith(' chloe@example.be ', ' secret with spaces ');

    expect(signIn).toHaveBeenCalledExactlyOnceWith({
      email: 'chloe@example.be',
      password: ' secret with spaces ',
    });
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('should say the credentials are wrong without telling which one, and allow retrying', async () => {
    signIn.mockRejectedValueOnce(new HttpErrorResponse({ status: 401 }));

    await submitWith('chloe@example.be', 'wrong');

    expect(textOf(host, '[role="alert"]')).toBe('Email ou mot de passe incorrect.');
    expect(navigateByUrl).not.toHaveBeenCalled();

    buttonNamed(host, 'Se connecter').click();
    await settle(fixture);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, 'Trop de tentatives. Réessaie dans une minute.'],
    [500, 'Une erreur est survenue. Réessaie dans un instant.'],
    [0, 'Une erreur est survenue. Réessaie dans un instant.'],
  ])('should explain a %s answer', async (status, message) => {
    signIn.mockRejectedValue(new HttpErrorResponse({ status }));

    await submitWith('chloe@example.be', 'secret123');

    expect(textOf(host, '[role="alert"]')).toBe(message);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
