import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import { SignUpRequest } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { OnboardingState } from '../../../core/onboarding/onboarding-state';
import { SignUp } from './sign-up';

describe('SignUp', () => {
  const signUp = vi.fn<(request: SignUpRequest) => Promise<void>>();
  const markIntroSeen = vi.fn();
  let fixture: ComponentFixture<SignUp>;
  let host: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    signUp.mockReset().mockResolvedValue();
    markIntroSeen.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { signUp } },
        { provide: OnboardingState, useValue: { markIntroSeen } },
      ],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(SignUp);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  function fillIn(
    values: Partial<{ username: string; email: string; password: string }> = {},
  ): void {
    typeInto(host, '#sign-up-username', values.username ?? 'chloe');
    typeInto(host, '#sign-up-email', values.email ?? 'chloe@example.be');
    typeInto(host, '#sign-up-password', values.password ?? 'motdepasse');
  }

  function acceptTerms(): void {
    query<HTMLInputElement>(host, 'input[type="checkbox"]').click();
  }

  async function submit(): Promise<void> {
    buttonNamed(host, 'Créer mon compte').click();
    await settle(fixture);
  }

  function errorOf(id: string): string {
    return textOf(host, `#sign-up-${id}-error`);
  }

  it('should show the form of screen 4 with a way back to sign-in', () => {
    expect(textOf(host, 'h1')).toBe('Créer un compte');
    expect(linkNamed(host, 'Connexion').getAttribute('href')).toBe('/sign-in');
    expect(query<HTMLInputElement>(host, '#sign-up-username').placeholder).toBe(
      'Affiché sur tes paquets publiés',
    );
    expect(host.querySelector('.form-error')).toBeNull();
  });

  it('should explain every missing value and send nothing', async () => {
    await submit();

    expect(errorOf('username')).toBe('Ce champ est obligatoire.');
    expect(errorOf('email')).toBe('Ce champ est obligatoire.');
    expect(errorOf('password')).toBe('Ce champ est obligatoire.');
    expect(errorOf('terms')).toBe('Accepte les conditions pour continuer.');
    expect(query(host, '#sign-up-email').getAttribute('aria-invalid')).toBe('true');
    expect(query(host, '#sign-up-email').getAttribute('aria-describedby')).toBe(
      'sign-up-email-error',
    );
    expect(signUp).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('should check the formats before sending', async () => {
    fillIn({ username: ' chloe', email: 'not-an-email', password: 'short' });
    acceptTerms();

    await submit();

    expect(errorOf('username')).toBe('3 à 30 lettres sans accent, chiffres, points, tirets ou _.');
    expect(errorOf('email')).toBe('Saisis une adresse email valide.');
    expect(errorOf('password')).toBe('Au moins 8 caractères.');
    expect(host.querySelector('#sign-up-terms-error')).toBeNull();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('should create the account, without the spaces around the e-mail, then open the home screen', async () => {
    fillIn({ email: '  chloe@example.be ' });
    acceptTerms();

    await submit();

    expect(signUp).toHaveBeenCalledExactlyOnceWith({
      username: 'chloe',
      email: 'chloe@example.be',
      password: 'motdepasse',
      acceptedTerms: true,
    });
    expect(markIntroSeen).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('should disable the button while the account is being created', async () => {
    let finish!: () => void;
    signUp.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    fillIn();
    acceptTerms();

    await submit();
    expect(buttonNamed(host, 'Créer mon compte').disabled).toBe(true);

    finish();
    await settle(fixture);
    expect(buttonNamed(host, 'Créer mon compte').disabled).toBe(false);
  });

  it('should show a taken username on its field until it is changed', async () => {
    signUp.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { errors: { username: ['taken'] } } }),
    );
    fillIn();
    acceptTerms();

    await submit();

    expect(errorOf('username')).toBe('Ce pseudo est déjà pris.');
    expect(host.querySelector('#sign-up-email-error')).toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(markIntroSeen).not.toHaveBeenCalled();

    typeInto(host, '#sign-up-username', 'chloe2');
    await settle(fixture);
    expect(host.querySelector('#sign-up-username-error')).toBeNull();
  });

  it('should show a taken e-mail address on its field', async () => {
    signUp.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { errors: { email: ['taken'] } } }),
    );
    fillIn();
    acceptTerms();

    await submit();

    expect(errorOf('email')).toBe('Cette adresse a déjà un compte.');
    expect(host.querySelector('#sign-up-username-error')).toBeNull();
  });

  it('should ask to wait when rate limited, and allow sending the same values again', async () => {
    signUp.mockRejectedValueOnce(new HttpErrorResponse({ status: 429 }));
    fillIn();
    acceptTerms();

    await submit();
    expect(textOf(host, '[role="alert"]')).toBe('Trop de tentatives. Réessaie dans une minute.');

    await submit();
    expect(signUp).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('should show a generic message when the API cannot be reached', async () => {
    signUp.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    fillIn();
    acceptTerms();

    await submit();

    expect(textOf(host, '[role="alert"]')).toBe(
      'Une erreur est survenue. Réessaie dans un instant.',
    );
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
