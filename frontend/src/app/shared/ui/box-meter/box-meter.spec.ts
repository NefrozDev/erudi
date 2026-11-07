import { TestBed } from '@angular/core/testing';
import { BoxMeter } from './box-meter';

describe('BoxMeter', () => {
  async function render(level: number): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(BoxMeter);
    fixture.componentRef.setInput('level', level);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it.each([0, 1, 3, 5])('should fill %s of the five bars', async (level) => {
    const host = await render(level);

    expect(host.querySelectorAll('.box-meter__bar')).toHaveLength(5);
    expect(host.querySelectorAll('.box-meter__bar--filled')).toHaveLength(level);
  });

  it('should fill the lowest bars first', async () => {
    const host = await render(2);
    const filled = [...host.querySelectorAll('.box-meter__bar')].map((bar) =>
      bar.classList.contains('box-meter__bar--filled'),
    );

    expect(filled).toEqual([true, true, false, false, false]);
  });

  it('should be hidden from assistive technologies', async () => {
    expect((await render(3)).getAttribute('aria-hidden')).toBe('true');
  });
});
