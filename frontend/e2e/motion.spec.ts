import { expect, test } from '@playwright/test';
import { openScreen, screens } from './support/screens';

// The screens where Plic appears, one per mood or more.
const withPlic = screens.filter((screen) =>
  [
    'intro, first slide',
    'intro, last slide',
    'sign-in',
    'home without decks',
    'deck not found',
    'quiz, nothing due',
    'quiz, done',
  ].includes(screen.name),
);

test.describe('Plic stops moving by itself within five seconds (2.2.2)', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const screen of withPlic) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);

      const ends = await page.evaluate(() =>
        (document.querySelector('app-plic')?.getAnimations({ subtree: true }) ?? []).map(
          (animation) => animation.effect?.getComputedTiming().endTime,
        ),
      );
      expect(ends.length, 'Plic moves').toBeGreaterThan(0);
      for (const end of ends) {
        expect(Number(end)).toBeLessThanOrEqual(5000);
      }
    });
  }

  test('a click on Plic plays its animation again', async ({ page }) => {
    const [home] = screens.filter((screen) => screen.name === 'home without decks');
    await openScreen(page, home);
    const running = () =>
      page.evaluate(
        () =>
          (document.querySelector('app-plic')?.getAnimations({ subtree: true }) ?? []).filter(
            (animation) => animation.playState === 'running',
          ).length,
      );
    await expect.poll(running, { timeout: 7000 }).toBe(0);

    await page.locator('app-plic').click();

    expect(await running()).toBeGreaterThan(0);
  });
});

test.describe('Plic keeps still when the device asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const screen of withPlic) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);
      // Even when asked to play again.
      await page.locator('app-plic').dispatchEvent('click');

      const plicAnimations = await page.evaluate(
        () => document.querySelector('app-plic')?.getAnimations({ subtree: true }).length,
      );
      expect(plicAnimations).toBe(0);
    });
  }
});
