import { TestBed } from '@angular/core/testing';
import { Plic, PlicMood } from './plic';

describe('Plic', () => {
  async function render(mood?: PlicMood): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(Plic);
    if (mood) {
      fixture.componentRef.setInput('mood', mood);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('should be hidden from assistive technologies, the screen text saying what it means', async () => {
    const host = await render();

    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('should draw seven card-spikes', async () => {
    const host = await render();

    expect(host.querySelectorAll('.plic__spikes rect')).toHaveLength(7);
  });

  it('should be happy by default, with open eyes and a smile', async () => {
    const host = await render();

    expect(host.dataset['mood']).toBe('happy');
    expect(host.querySelector('path.plic__mouth')).not.toBeNull();
    expect(host.querySelectorAll('circle[r="12"]')).toHaveLength(2);
  });

  it('should open a round mouth when surprised', async () => {
    const host = await render('surprised');

    expect(host.dataset['mood']).toBe('surprised');
    expect(host.querySelector('ellipse.plic__mouth')).not.toBeNull();
  });

  it('should close its eyes and show sparkles when proud', async () => {
    const host = await render('proud');

    expect(host.querySelectorAll('circle[r="12"]')).toHaveLength(0);
    expect(host.querySelectorAll('path[fill="#ffc93c"], g[fill="#ffc93c"] path')).toHaveLength(2);
  });

  it('should snore when sleepy', async () => {
    const host = await render('sleepy');

    expect([...host.querySelectorAll('text')].map((z) => z.textContent)).toEqual(['z', 'z']);
    expect(host.querySelectorAll('circle[r="12"]')).toHaveLength(0);
  });
});
