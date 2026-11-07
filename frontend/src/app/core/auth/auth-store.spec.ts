import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AuthApi, AuthUser } from './auth-api';
import { AuthStore } from './auth-store';

describe('AuthStore', () => {
  const user: AuthUser = { id: '1', username: 'chloe', email: 'chloe@example.be' };
  const failure = new HttpErrorResponse({ status: 401 });
  let api: {
    getSession: ReturnType<typeof vi.fn<() => Observable<AuthUser>>>;
    register: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn<() => Observable<void>>>;
    deleteAccount: ReturnType<typeof vi.fn<(password: string) => Observable<void>>>;
  };
  let store: AuthStore;

  beforeEach(() => {
    api = {
      getSession: vi.fn(() => of(user)),
      register: vi.fn(() => of(user)),
      login: vi.fn(() => of(user)),
      logout: vi.fn(() => of(undefined)),
      deleteAccount: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }] });
    store = TestBed.inject(AuthStore);
  });

  it('should start signed out', () => {
    expect(store.user()).toBeNull();
    expect(store.signedIn()).toBe(false);
  });

  it('should restore the user the session cookie belongs to', async () => {
    await store.restore();

    expect(api.getSession).toHaveBeenCalledTimes(1);
    expect(store.user()).toEqual(user);
    expect(store.signedIn()).toBe(true);
  });

  it('should stay signed out when there is no valid session', async () => {
    api.getSession.mockReturnValue(throwError(() => failure));

    await expect(store.restore()).resolves.toBeUndefined();

    expect(store.signedIn()).toBe(false);
  });

  it('should sign up and keep the new user', async () => {
    const request = {
      username: 'chloe',
      email: 'chloe@example.be',
      password: 'secret123',
      acceptedTerms: true,
    };

    await store.signUp(request);

    expect(api.register).toHaveBeenCalledExactlyOnceWith(request);
    expect(store.user()).toEqual(user);
  });

  it('should reject a failed sign-up with the HTTP error and stay signed out', async () => {
    const conflict = new HttpErrorResponse({ status: 409 });
    api.register.mockReturnValue(throwError(() => conflict));

    await expect(
      store.signUp({
        username: 'chloe',
        email: 'chloe@example.be',
        password: 'secret123',
        acceptedTerms: true,
      }),
    ).rejects.toBe(conflict);

    expect(store.signedIn()).toBe(false);
  });

  it('should sign in and keep the user', async () => {
    await store.signIn({ email: 'chloe@example.be', password: 'secret123' });

    expect(api.login).toHaveBeenCalledExactlyOnceWith({
      email: 'chloe@example.be',
      password: 'secret123',
    });
    expect(store.user()).toEqual(user);
  });

  it('should reject a failed sign-in with the HTTP error and stay signed out', async () => {
    api.login.mockReturnValue(throwError(() => failure));

    await expect(store.signIn({ email: 'chloe@example.be', password: 'wrong' })).rejects.toBe(
      failure,
    );

    expect(store.signedIn()).toBe(false);
  });

  it('should sign out on the server and forget the user', async () => {
    await store.signIn({ email: 'chloe@example.be', password: 'secret123' });

    await store.signOut();

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(store.signedIn()).toBe(false);
  });

  it('should forget the user even when the API cannot be reached on sign-out', async () => {
    await store.signIn({ email: 'chloe@example.be', password: 'secret123' });
    api.logout.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    await expect(store.signOut()).resolves.toBeUndefined();

    expect(store.signedIn()).toBe(false);
  });

  it('should delete the account with the password, then forget the user', async () => {
    await store.restore();

    await store.deleteAccount('secret123');

    expect(api.deleteAccount).toHaveBeenCalledExactlyOnceWith('secret123');
    expect(store.signedIn()).toBe(false);
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('should keep the user and reject with the HTTP error when the deletion fails', async () => {
    await store.restore();
    const refused = new HttpErrorResponse({ status: 400 });
    api.deleteAccount.mockReturnValue(throwError(() => refused));

    await expect(store.deleteAccount('wrong')).rejects.toBe(refused);

    expect(store.user()).toEqual(user);
  });

  it('should forget the user without calling the API when the server ended the session', async () => {
    await store.restore();

    store.clear();

    expect(store.user()).toBeNull();
    expect(api.logout).not.toHaveBeenCalled();
  });
});
