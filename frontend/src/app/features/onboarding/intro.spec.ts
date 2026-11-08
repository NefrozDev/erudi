import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { buttonNamed, textOf } from '../../../testing/dom';
import { OnboardingState } from '../../core/onboarding/onboarding-state';
import { Intro } from './intro';

describe('Intro', () => {
  const markIntroSeen = vi.fn();
  let fixture: ComponentFixture<Intro>;
  let host: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    markIntroSeen.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: OnboardingState, useValue: { markIntroSeen } }],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Intro);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function clickButton(name: string): Promise<void> {
    buttonNamed(host, name).click();
    await fixture.whenStable();
  }

  it('should start by explaining the five boxes', () => {
    expect(textOf(host, 'h1')).toBe('Révise au bon moment');
    expect(host.textContent).toContain('Tes cartes sont rangées dans 5 boîtes.');
    expect(host.textContent).toContain('Étape 1 sur 3');
    expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('happy');
    expect(host.querySelector('app-plic')?.hasAttribute('data-waving')).toBe(true);
    expect(host.querySelectorAll('.intro__dot--active')).toHaveLength(1);
  });

  it('should then explain both answers', async () => {
    await clickButton('Suivant');

    expect(textOf(host, 'h1')).toBe('Bonne ou mauvaise réponse ?');
    expect(host.textContent).toContain('Je savais');
    expect(host.textContent).toContain('La carte retourne en boîte 1 et revient bientôt.');
    expect(host.textContent).toContain('Étape 2 sur 3');
    expect(host.querySelector('app-plic')?.getAttribute('data-mood')).toBe('surprised');
    expect(host.querySelector('app-plic')?.hasAttribute('data-waving')).toBe(false);
  });

  it('should end on the choice between creating an account and signing in, without skip', async () => {
    await clickButton('Suivant');
    await clickButton('Suivant');

    expect(textOf(host, 'h1')).toBe('On commence ?');
    expect(buttonNamed(host, 'Créer un compte')).toBeTruthy();
    expect(buttonNamed(host, "J'ai déjà un compte")).toBeTruthy();
    expect(() => buttonNamed(host, 'Passer')).toThrow();
    expect(() => buttonNamed(host, 'Suivant')).toThrow();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(markIntroSeen).not.toHaveBeenCalled();
  });

  it('should skip to the sign-up screen and remember the intro was seen', async () => {
    await clickButton('Passer');

    expect(markIntroSeen).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sign-up');
  });

  it('should open the sign-up screen from the last step', async () => {
    await clickButton('Suivant');
    await clickButton('Suivant');
    await clickButton('Créer un compte');

    expect(markIntroSeen).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sign-up');
  });

  it('should open the sign-in screen for someone who has an account', async () => {
    await clickButton('Suivant');
    await clickButton('Suivant');
    await clickButton("J'ai déjà un compte");

    expect(markIntroSeen).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sign-in');
  });
});
