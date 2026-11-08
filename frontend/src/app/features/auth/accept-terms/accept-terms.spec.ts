import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { buttonNamed, linkNamed, settle, textOf } from '../../../../testing/dom';
import { AuthStore } from '../../../core/auth/auth-store';
import { AcceptTerms } from './accept-terms';

describe('AcceptTerms', () => {
  const acceptTerms = vi.fn<() => Promise<void>>();
  let fixture: ComponentFixture<AcceptTerms>;
  let host: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    acceptTerms.mockReset().mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { acceptTerms } }],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AcceptTerms);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it("should open Erudi's terms in a new tab, without accepting anything yet", () => {
    expect(textOf(host, 'h1')).toBe('Bienvenue sur Erudi');
    const terms = linkNamed(host, 'Lire les conditions et la politique de confidentialité');
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(terms.target).toBe('_blank');
    expect(acceptTerms).not.toHaveBeenCalled();
  });

  it('should record the acceptance, then open the home screen', async () => {
    buttonNamed(host, "J'accepte et je continue").click();
    await settle(fixture);

    expect(acceptTerms).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('should disable the button while saving', async () => {
    let finish!: () => void;
    acceptTerms.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    buttonNamed(host, "J'accepte et je continue").click();
    await settle(fixture);
    expect(buttonNamed(host, "J'accepte et je continue").disabled).toBe(true);
    expect(navigateByUrl).not.toHaveBeenCalled();

    finish();
    await settle(fixture);
    expect(navigateByUrl).toHaveBeenCalledTimes(1);
  });

  it('should say so and stay, ready to retry, when saving fails', async () => {
    acceptTerms.mockRejectedValueOnce(new Error('down'));

    buttonNamed(host, "J'accepte et je continue").click();
    await settle(fixture);

    expect(textOf(host, '[role="alert"]')).toBe(
      "L'enregistrement a échoué. Réessaie dans un instant.",
    );
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(buttonNamed(host, "J'accepte et je continue").disabled).toBe(false);

    buttonNamed(host, "J'accepte et je continue").click();
    await settle(fixture);
    expect(acceptTerms).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/');
  });
});
