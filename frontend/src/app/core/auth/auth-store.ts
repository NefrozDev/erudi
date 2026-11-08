import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApi, AuthUser } from './auth-api';

/**
 * The signed-in user, the server being the source of truth. Signing in happens on the
 * Synapse account: the API opens Erudi's session on the way back.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly currentUser = signal<AuthUser | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly signedIn = computed(() => this.currentUser() !== null);

  /** Asks the API who the session cookie belongs to. Any failure means signed out. */
  async restore(): Promise<void> {
    try {
      this.currentUser.set(await firstValueFrom(this.api.getSession()));
    } catch {
      this.currentUser.set(null);
    }
  }

  /**
   * Signed out locally even if the API cannot be reached. Resolves with where to send the
   * browser to sign out of every Synapse app, or null when the API did not answer.
   */
  async signOut(): Promise<string | null> {
    try {
      return (await firstValueFrom(this.api.logout())).redirectTo;
    } catch {
      // The cookie expires on its own; the user must not stay stuck signed in.
      return null;
    } finally {
      this.currentUser.set(null);
    }
  }

  /** Erudi's own terms; rejects with the HTTP error, keeping the user as they were. */
  async acceptTerms(): Promise<void> {
    this.currentUser.set(await firstValueFrom(this.api.acceptTerms()));
  }

  /** The server ended the session (expired, or signed out on another app or device). */
  clear(): void {
    this.currentUser.set(null);
  }
}
