import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  /** False until Erudi's own terms are accepted, on its first screen after signing in. */
  termsAccepted: boolean;
}

/** Where to send the browser after signing out of Erudi: the identity service. */
export interface SignOutResponse {
  redirectTo: string;
}

/** Where the browser goes to sign in with the Synapse account, coming back to `returnTo`. */
export function signInUrl(returnTo: string, language: string): string {
  const params = new URLSearchParams({ returnTo, lang: language });
  return `/api/auth/login?${params.toString()}`;
}

/**
 * The session lives in an HttpOnly cookie set by the API: this code never sees the token,
 * so an injected script cannot steal it.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  getSession(): Observable<AuthUser> {
    return this.http.get<AuthUser>('/api/auth/session');
  }

  logout(): Observable<SignOutResponse> {
    return this.http.post<SignOutResponse>('/api/auth/logout', null);
  }

  acceptTerms(): Observable<AuthUser> {
    return this.http.post<AuthUser>('/api/account/terms', null);
  }
}
