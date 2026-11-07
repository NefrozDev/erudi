import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import { AuthStore } from '../../../core/auth/auth-store';
import { DeleteAccount } from './delete-account';

describe('DeleteAccount', () => {
  const deleteAccount = vi.fn<(password: string) => Promise<void>>();
  let fixture: ComponentFixture<DeleteAccount>;
  let host: HTMLElement;

  beforeEach(async () => {
    deleteAccount.mockReset().mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { deleteAccount } }],
    });
    fixture = TestBed.createComponent(DeleteAccount);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function confirm(password = 'secret123'): Promise<void> {
    typeInto(host, '#delete-account-password', password);
    buttonNamed(host, 'Supprimer définitivement').click();
    await settle(fixture);
  }

  function badRequest(errors: Record<string, string[]>): HttpErrorResponse {
    return new HttpErrorResponse({ status: 400, error: { errors } });
  }

  it('should say what will be deleted and what stays, with ways back', () => {
    expect(textOf(host, 'h1')).toBe('Supprimer mon compte');
    expect([...host.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'ton compte, ton pseudo et ton adresse email ;',
      'tes paquets, tes cartes et ta progression ;',
      "tes publications dans l'Explorer, tes scores et tes signalements.",
    ]);
    expect(textOf(host, '.delete-account__summary p')).toBe(
      "Les copies que d'autres ont faites de tes paquets restent à eux.",
    );
    expect(linkNamed(host, 'Réglages').getAttribute('href')).toBe('/settings');
    expect(linkNamed(host, 'Annuler').getAttribute('href')).toBe('/settings');
    expect(query<HTMLInputElement>(host, '#delete-account-password').autocomplete).toBe(
      'current-password',
    );
  });

  it('should ask for the password and delete nothing without it', async () => {
    buttonNamed(host, 'Supprimer définitivement').click();
    await settle(fixture);

    expect(textOf(host, '#delete-account-password-error')).toBe('Ce champ est obligatoire.');
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('should delete the account with the password, then say goodbye', async () => {
    await confirm('secret123');

    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith('secret123');
    expect(host.querySelector('form')).toBeNull();
    expect(textOf(host, 'h1')).toBe('Ton compte est supprimé');
    expect(document.activeElement).toBe(query(host, 'h1'));
    expect(linkNamed(host, "Retour à l'accueil").getAttribute('href')).toBe('/welcome');
  });

  it('should send the request once, the button waiting meanwhile', async () => {
    let finish!: () => void;
    deleteAccount.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    await confirm();
    expect(buttonNamed(host, 'Supprimer définitivement').disabled).toBe(true);
    buttonNamed(host, 'Supprimer définitivement').click();

    finish();
    await settle(fixture);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(textOf(host, 'h1')).toBe('Ton compte est supprimé');
  });

  it('should show a wrong password on its field and keep the account', async () => {
    deleteAccount.mockRejectedValue(badRequest({ password: ['The password is incorrect.'] }));

    await confirm('not mine');

    expect(textOf(host, '#delete-account-password-error')).toBe('Mot de passe incorrect.');
    const field = query(host, '#delete-account-password');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe('delete-account-password-error');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(textOf(host, 'h1')).toBe('Supprimer mon compte');
  });

  it.each([
    [429, 'Trop de tentatives. Réessaie dans une minute.'],
    [500, 'La suppression a échoué. Réessaie dans un instant.'],
    [0, 'La suppression a échoué. Réessaie dans un instant.'],
  ])('should explain a %s answer and allow trying again', async (status, message) => {
    deleteAccount.mockRejectedValueOnce(new HttpErrorResponse({ status }));

    await confirm();
    expect(textOf(host, '[role="alert"]')).toBe(message);
    expect(buttonNamed(host, 'Supprimer définitivement').disabled).toBe(false);

    buttonNamed(host, 'Supprimer définitivement').click();
    await settle(fixture);
    expect(deleteAccount).toHaveBeenCalledTimes(2);
    expect(textOf(host, 'h1')).toBe('Ton compte est supprimé');
  });

  it('should say nothing more when the session had already ended', async () => {
    // The session-expiry interceptor already opened the sign-in screen.
    deleteAccount.mockRejectedValue(new HttpErrorResponse({ status: 401 }));

    await confirm();

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.form-error')).toBeNull();
    expect(textOf(host, 'h1')).toBe('Supprimer mon compte');
  });
});
