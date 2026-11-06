import { TestBed } from '@angular/core/testing';
import { textOf } from '../../../testing/dom';
import { ComingSoon } from './coming-soon';

describe('ComingSoon', () => {
  it('should tell that the tab is coming, with a sleeping Plic', async () => {
    const fixture = TestBed.createComponent(ComingSoon);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(textOf(host, 'h1')).toBe('Bientôt disponible');
    expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('sleepy');
  });
});
