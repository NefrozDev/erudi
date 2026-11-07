import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApi, AuthUser, SignInRequest, SignUpRequest } from './auth-api';

/** The signed-in user, the server being the source of truth. */
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

  /** Rejects with the HTTP error, for the form to explain it. */
  async signUp(request: SignUpRequest): Promise<void> {
    this.currentUser.set(await firstValueFrom(this.api.register(request)));
  }

  /** Rejects with the HTTP error, for the form to explain it. */
  async signIn(request: SignInRequest): Promise<void> {
    this.currentUser.set(await firstValueFrom(this.api.login(request)));
  }

  /** Signed out locally even if the API cannot be reached. */
  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      // The cookie expires on its own; the user must not stay stuck signed in.
    } finally {
      this.currentUser.set(null);
    }
  }

  /** Signed out once the account is gone; rejects with the HTTP error, keeping the user. */
  async deleteAccount(password: string): Promise<void> {
    await firstValueFrom(this.api.deleteAccount(password));
    this.currentUser.set(null);
  }

  /** The server ended the session (expired, or a password reset signed every device out). */
  clear(): void {
    this.currentUser.set(null);
  }
}
