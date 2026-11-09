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
    // Both eyes in one group, which blinks.
    expect(host.querySelectorAll('.plic__eyes circle[r="12"]')).toHaveLength(2);
    expect(host.querySelector('.plic__drop')).toBeNull();
    expect(host.querySelector('.plic__cheer')).toBeNull();
    expect(host.querySelector('.plic__arm')).not.toBeNull();
  });

  it('should only wave when asked, with its arm in its own group', async () => {
    const still = await render();
    expect(still.hasAttribute('data-waving')).toBe(false);

    const fixture = TestBed.createComponent(Plic);
    fixture.componentRef.setInput('waving', true);
    await fixture.whenStable();
    const waving = fixture.nativeElement as HTMLElement;

    expect(waving.hasAttribute('data-waving')).toBe(true);
    expect(waving.querySelectorAll('.plic__arm > ellipse')).toHaveLength(1);
  });

  it('should open a round mouth and shed droplets when surprised', async () => {
    const host = await render('surprised');

    expect(host.dataset['mood']).toBe('surprised');
    expect(host.querySelector('ellipse.plic__mouth')).not.toBeNull();
    expect(host.querySelectorAll('.plic__drop')).toHaveLength(4);
    expect(host.querySelectorAll('.plic__eyes circle[r="4"]')).toHaveLength(2);
  });

  it('should close its eyes, cheer with both arms raised and show sparkles when proud', async () => {
    const host = await render('proud');

    expect(host.querySelectorAll('.plic__cheer')).toHaveLength(2);
    expect(host.querySelector('.plic__arm')).toBeNull();

    expect(host.querySelectorAll('circle[r="12"]')).toHaveLength(0);
    expect(host.querySelectorAll('path[fill="#ffc93c"], g[fill="#ffc93c"] path')).toHaveLength(2);
  });

  it('should do a card trick when magician: a hat, a deck, four flying cards and a wink', async () => {
    const host = await render('magician');

    expect(host.dataset['mood']).toBe('magician');
    expect(host.querySelector('.plic__hat')).not.toBeNull();
    expect(host.querySelector('.plic__toss-arm .plic__deck')).not.toBeNull();
    expect(host.querySelector('.plic__arm')).toBeNull();
    expect(host.querySelector('.plic__cheer')).toBeNull();

    // White playing cards, red and dark suits in turn: not the coloured spike-cards.
    const cards = [...host.querySelectorAll<SVGGElement>('.plic__toss-x')];
    expect(cards.map((card) => card.querySelector('rect')?.getAttribute('fill'))).toEqual(
      Array(4).fill('#ffffff'),
    );
    expect(cards.map((card) => card.querySelector('path')?.getAttribute('fill'))).toEqual([
      '#ff5d73',
      '#17153b',
      '#ff5d73',
      '#17153b',
    ]);
    // Spread along the flight, each starting its animation where it rests without motion.
    expect(cards.map((card) => card.getAttribute('transform'))).toEqual([
      'translate(35 0)',
      'translate(70 0)',
      'translate(106 0)',
      'translate(141 0)',
    ]);
    expect(
      cards.map((card) => card.querySelector('.plic__toss-y')?.getAttribute('transform')),
    ).toEqual(['translate(0 -41)', 'translate(0 -61)', 'translate(0 -61)', 'translate(0 -41)']);
    expect(cards.map((card) => card.style.getPropertyValue('--toss-delay'))).toEqual([
      '-0.48s',
      '-0.96s',
      '-1.44s',
      '-1.92s',
    ]);

    // Only the right eye winks; both are open.
    expect(host.querySelectorAll('circle[r="12"]')).toHaveLength(2);
    expect(host.querySelectorAll('.plic__wink circle[r="12"]')).toHaveLength(1);
    expect(host.querySelector('.plic__eyes')).toBeNull();
    expect(host.querySelectorAll('.plic__sparkle')).toHaveLength(2);
    expect(host.querySelector('path.plic__mouth')).not.toBeNull();
  });

  it('should keep the trick to the magician', async () => {
    const host = await render('happy');

    expect(host.querySelector('.plic__hat')).toBeNull();
    expect(host.querySelector('.plic__toss-x')).toBeNull();
    expect(host.querySelector('.plic__wink')).toBeNull();
  });

  it('should snore when sleepy', async () => {
    const host = await render('sleepy');

    // Each z drifts up on its own.
    expect([...host.querySelectorAll('text.plic__z')].map((z) => z.textContent)).toEqual([
      'z',
      'z',
    ]);
    expect(host.querySelectorAll('circle[r="12"]')).toHaveLength(0);
    expect(host.querySelector('.plic__eyes')).toBeNull();
  });
});
