import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthApi, AuthUser, signInUrl } from './auth-api';

describe('AuthApi', () => {
  const user: AuthUser = { id: '1', username: 'chloe', email: 'chloe@example.be', termsAccepted: true };
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should build the sign-in address with the way back and the language', () => {
    expect(signInUrl('/decks/1', 'fr')).toBe('/api/auth/login?returnTo=%2Fdecks%2F1&lang=fr');
  });

  it('should read the session, sign out and accept the terms on the API', async () => {
    const session = firstValueFrom(api.getSession());
    http.expectOne({ method: 'GET', url: '/api/auth/session' }).flush(user);
    expect(await session).toEqual(user);

    const logout = firstValueFrom(api.logout());
    http
      .expectOne({ method: 'POST', url: '/api/auth/logout' })
      .flush({ redirectTo: 'https://auth.example/oidc/session/end' });
    expect(await logout).toEqual({ redirectTo: 'https://auth.example/oidc/session/end' });

    const accepted = firstValueFrom(api.acceptTerms());
    http.expectOne({ method: 'POST', url: '/api/account/terms' }).flush(user);
    expect(await accepted).toEqual(user);
  });
});
