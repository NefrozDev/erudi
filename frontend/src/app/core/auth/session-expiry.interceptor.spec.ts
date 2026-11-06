import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from './auth-store';
import { sessionExpiryInterceptor } from './session-expiry.interceptor';

describe('sessionExpiryInterceptor', () => {
  const signedIn = signal(true);
  const clear = vi.fn();
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    signedIn.set(true);
    clear.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([sessionExpiryInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { signedIn, clear } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => controller.verify());

  function failingCall(url: string, status: number): unknown[] {
    const errors: unknown[] = [];
    http.get(url).subscribe({ error: (error: unknown) => errors.push(error) });
    controller.expectOne(url).flush(null, { status, statusText: 'Error' });
    return errors;
  }

  it('should sign out locally and open the sign-in screen when the session ended', () => {
    const errors = failingCall('/api/decks', 401);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sign-in');
    expect(errors).toHaveLength(1);
    expect((errors[0] as HttpErrorResponse).status).toBe(401);
  });

  it('should leave the auth screens to explain their own 401', () => {
    const errors = failingCall('/api/auth/login', 401);

    expect(clear).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });

  it('should not redirect someone who was not signed in', () => {
    signedIn.set(false);

    failingCall('/api/decks', 401);

    expect(clear).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('should pass other errors through untouched', () => {
    const errors = failingCall('/api/decks', 500);

    expect(clear).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect((errors[0] as HttpErrorResponse).status).toBe(500);
  });

  it('should not interfere with successful calls', () => {
    const answers: unknown[] = [];
    http.get('/api/decks').subscribe((answer) => answers.push(answer));
    controller.expectOne('/api/decks').flush([]);

    expect(answers).toEqual([[]]);
    expect(clear).not.toHaveBeenCalled();
  });
});
