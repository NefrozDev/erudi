import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

export interface SignInRequest {
  email: string;
  password: string;
}

/**
 * The session lives in an HttpOnly cookie set by the API: this code never sees the token,
 * so an injected script cannot steal it.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  register(request: SignUpRequest): Observable<AuthUser> {
    return this.http.post<AuthUser>('/api/auth/register', request);
  }

  login(request: SignInRequest): Observable<AuthUser> {
    return this.http.post<AuthUser>('/api/auth/login', request);
  }

  getSession(): Observable<AuthUser> {
    return this.http.get<AuthUser>('/api/auth/session');
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null);
  }

  /** Always succeeds for a well-formed address, whether or not it has an account. */
  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>('/api/auth/password-reset', { email });
  }

  confirmPasswordReset(token: string, password: string): Observable<void> {
    return this.http.post<void>('/api/auth/password-reset/confirm', { token, password });
  }
}
