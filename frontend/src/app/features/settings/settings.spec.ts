import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { buttonNamed, settle, textOf } from '../../../testing/dom';
import { AuthUser } from '../../core/auth/auth-api';
import { AuthStore } from '../../core/auth/auth-store';
import { Settings } from './settings';

describe('Settings', () => {
  const user = signal<AuthUser | null>({ id: '1', username: 'chloe', email: 'chloe@example.be' });
  const signOut = vi.fn<() => Promise<void>>();
  let fixture: ComponentFixture<Settings>;
  let host: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    signOut.mockReset().mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { user, signOut } }],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Settings);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('should show the account e-mail', () => {
    expect(textOf(host, 'h1')).toBe('Réglages');
    expect(textOf(host, 'dt')).toBe('Compte');
    expect(textOf(host, 'dd')).toBe('chloe@example.be');
  });

  it('should sign out, then open the sign-in screen', async () => {
    buttonNamed(host, 'Se déconnecter').click();
    await settle(fixture);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sign-in');
  });

  it('should disable the button while signing out, and navigate only once it is done', async () => {
    let finish!: () => void;
    signOut.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    buttonNamed(host, 'Se déconnecter').click();
    await settle(fixture);
    expect(buttonNamed(host, 'Se déconnecter').disabled).toBe(true);
    expect(navigateByUrl).not.toHaveBeenCalled();

    finish();
    await settle(fixture);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sign-in');
  });
});
