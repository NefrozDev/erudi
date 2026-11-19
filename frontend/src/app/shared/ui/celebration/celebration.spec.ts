import { TestBed } from '@angular/core/testing';
import {
  CELEBRATION_MS,
  CELEBRATION_SCENES,
  Celebration,
  CelebrationScene,
  nextScene,
} from './celebration';

describe('Celebration', () => {
  afterEach(() => vi.useRealTimers());

  async function render(scene: CelebrationScene) {
    const fixture = TestBed.createComponent(Celebration);
    fixture.componentRef.setInput('scene', scene);
    const finished = vi.fn();
    fixture.componentInstance.finished.subscribe(finished);
    // With fake timers, whenStable() would wait for timers that never run.
    if (vi.isFakeTimers()) {
      fixture.detectChanges();
    } else {
      await fixture.whenStable();
    }
    return { fixture, host: fixture.nativeElement as HTMLElement, finished };
  }

  it('should be hidden from assistive technologies and name its scene', async () => {
    const { host } = await render('car');

    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.dataset['scene']).toBe('car');
    // Nothing in it can take the focus.
    expect(host.querySelector('a, button, [tabindex]')).toBeNull();
  });

  it.each([
    ['car', ['.cel-car', '.cel-car__thumb', '.cel-car__wheel']],
    ['podium', ['.cel-podium__arm', '.cel-podium__flash']],
    ['lab', ['.cel-lab__left', '.cel-lab__right', '.cel-lab__sparkle']],
    ['gift', ['.cel-gift__lid', '.cel-gift__confetti']],
    ['rocket', ['.cel-rocket', '.cel-rocket__flame', '.cel-rocket__star']],
  ] as const)('should draw Plic and the props of the %s scene, and only those', async (scene, parts) => {
    const { host } = await render(scene);

    expect(host.querySelectorAll('.cel__eyes')).toHaveLength(1);
    for (const part of parts) {
      expect(host.querySelector(part), part).not.toBeNull();
    }
    const others = CELEBRATION_SCENES.filter((other) => other !== scene);
    for (const other of others) {
      expect(host.querySelector(`[class^="cel-${other}"]`), other).toBeNull();
    }
  });

  it('should draw four flashes on the podium, and a few confetti and sparkles', async () => {
    expect((await render('podium')).host.querySelectorAll('.cel-podium__flash')).toHaveLength(4);
    expect((await render('gift')).host.querySelectorAll('.cel-gift__confetti')).toHaveLength(14);
    expect((await render('lab')).host.querySelectorAll('.cel-lab__sparkle')).toHaveLength(7);
  });

  it('should say it is over once, when its time is up', async () => {
    vi.useFakeTimers();
    const { finished } = await render('lab');

    vi.advanceTimersByTime(CELEBRATION_MS - 1);
    expect(finished).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(finished).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CELEBRATION_MS * 2);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('should not say it is over once removed early', async () => {
    vi.useFakeTimers();
    const { fixture, finished } = await render('gift');

    fixture.destroy();
    vi.advanceTimersByTime(CELEBRATION_MS);

    expect(finished).not.toHaveBeenCalled();
  });

  it('should play under three seconds, well within the five of WCAG 2.2.2', () => {
    expect(CELEBRATION_MS).toBeLessThanOrEqual(3000);
  });
});

describe('nextScene', () => {
  it('should pick among every scene at first', () => {
    expect(nextScene(undefined, () => 0)).toBe('car');
    expect(nextScene(undefined, () => 0.999)).toBe('rocket');
  });

  it('should never pick the scene just played', () => {
    for (const previous of CELEBRATION_SCENES) {
      for (const draw of [0, 0.3, 0.6, 0.999]) {
        expect(nextScene(previous, () => draw)).not.toBe(previous);
      }
    }
    expect(nextScene('car', () => 0)).toBe('podium');
  });

  it('should stay in range even if the draw is exactly 1', () => {
    expect(nextScene('rocket', () => 1)).toBe('gift');
  });
});
