import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi, AuthUser } from './auth-api';

describe('AuthApi', () => {
  const user: AuthUser = { id: '1', username: 'chloe', email: 'chloe@example.be' };
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should register with the sign-up details and return the new user', () => {
    const request = {
      username: 'chloe',
      email: 'chloe@example.be',
      password: 'secret123',
      acceptedTerms: true,
    };
    const received: AuthUser[] = [];

    api.register(request).subscribe((answer) => received.push(answer));
    const call = http.expectOne('/api/auth/register');
    call.flush(user);

    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(request);
    expect(received).toEqual([user]);
  });

  it('should log in with the credentials and return the user', () => {
    const received: AuthUser[] = [];

    api
      .login({ email: 'chloe@example.be', password: 'secret123' })
      .subscribe((answer) => received.push(answer));
    const call = http.expectOne('/api/auth/login');
    call.flush(user);

    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ email: 'chloe@example.be', password: 'secret123' });
    expect(received).toEqual([user]);
  });

  it('should read the session with a GET', () => {
    const received: AuthUser[] = [];

    api.getSession().subscribe((answer) => received.push(answer));
    const call = http.expectOne('/api/auth/session');
    call.flush(user);

    expect(call.request.method).toBe('GET');
    expect(received).toEqual([user]);
  });

  it('should log out with an empty POST', () => {
    let completed = false;

    api.logout().subscribe({ complete: () => (completed = true) });
    const call = http.expectOne('/api/auth/logout');
    call.flush(null, { status: 204, statusText: 'No Content' });

    expect(call.request.method).toBe('POST');
    expect(call.request.body).toBeNull();
    expect(completed).toBe(true);
  });

  it('should ask for a password reset link for the address', () => {
    api.requestPasswordReset('chloe@example.be').subscribe();
    const call = http.expectOne('/api/auth/password-reset');
    call.flush(null, { status: 204, statusText: 'No Content' });

    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ email: 'chloe@example.be' });
  });

  it('should delete the account with a DELETE carrying the password', () => {
    let completed = false;

    api.deleteAccount('secret123').subscribe({ complete: () => (completed = true) });
    const call = http.expectOne('/api/account');
    call.flush(null, { status: 204, statusText: 'No Content' });

    expect(call.request.method).toBe('DELETE');
    expect(call.request.body).toEqual({ password: 'secret123' });
    expect(completed).toBe(true);
  });

  it('should confirm a password reset with the token and the new password', () => {
    api.confirmPasswordReset('token', 'new-secret').subscribe();
    const call = http.expectOne('/api/auth/password-reset/confirm');
    call.flush(null, { status: 204, statusText: 'No Content' });

    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ token: 'token', password: 'new-secret' });
  });
});
