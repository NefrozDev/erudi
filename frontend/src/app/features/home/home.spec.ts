import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { textOf } from '../../../testing/dom';
import { AuthUser } from '../../core/auth/auth-api';
import { AuthStore } from '../../core/auth/auth-store';
import { Home } from './home';

describe('Home', () => {
  const user = signal<AuthUser | null>({ id: '1', username: 'chloe', email: 'chloe@example.be' });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { user } }] });
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('should greet the signed-in user by their username', async () => {
    const host = await render();

    expect(textOf(host, 'header .subtitle')).toBe('Bonjour chloe');
    expect(textOf(host, 'h1')).toBe('Envie de réviser ?');
  });

  it('should show the empty state with a sleeping Plic until decks exist', async () => {
    const host = await render();

    expect(textOf(host, 'h2')).toBe("Aucun paquet pour l'instant");
    expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('sleepy');
  });
});
