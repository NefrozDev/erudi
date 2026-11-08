import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AuthApi, AuthUser, SignOutResponse } from './auth-api';
import { AuthStore } from './auth-store';

describe('AuthStore', () => {
  const user: AuthUser = { id: '1', username: 'chloe', email: 'chloe@example.be', termsAccepted: false };
  const failure = new HttpErrorResponse({ status: 500 });
  let api: {
    getSession: ReturnType<typeof vi.fn<() => Observable<AuthUser>>>;
    logout: ReturnType<typeof vi.fn<() => Observable<SignOutResponse>>>;
    acceptTerms: ReturnType<typeof vi.fn<() => Observable<AuthUser>>>;
  };
  let store: AuthStore;

  beforeEach(() => {
    api = {
      getSession: vi.fn(() => of(user)),
      logout: vi.fn(() => of({ redirectTo: 'https://auth.example/oidc/session/end' })),
      acceptTerms: vi.fn(() => of({ ...user, termsAccepted: true })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AuthApi, useValue: api }] });
    store = TestBed.inject(AuthStore);
  });

  it('should start signed out, then restore the user the session cookie belongs to', async () => {
    expect(store.signedIn()).toBe(false);

    await store.restore();

    expect(api.getSession).toHaveBeenCalledTimes(1);
    expect(store.user()).toEqual(user);
  });

  it('should treat any failure to restore as signed out', async () => {
    api.getSession.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

    await store.restore();

    expect(store.user()).toBeNull();
  });

  it('should sign out and give the identity service address to sign out everywhere', async () => {
    await store.restore();

    await expect(store.signOut()).resolves.toBe('https://auth.example/oidc/session/end');

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(store.user()).toBeNull();
  });

  it('should still sign out locally when the API cannot be reached', async () => {
    await store.restore();
    api.logout.mockReturnValue(throwError(() => failure));

    await expect(store.signOut()).resolves.toBeNull();

    expect(store.user()).toBeNull();
  });

  it("should keep the user updated by accepting Erudi's terms, and as it was when that fails", async () => {
    await store.restore();
    api.acceptTerms.mockReturnValueOnce(throwError(() => failure));

    await expect(store.acceptTerms()).rejects.toBe(failure);
    expect(store.user()?.termsAccepted).toBe(false);

    await store.acceptTerms();
    expect(store.user()?.termsAccepted).toBe(true);
  });
});
