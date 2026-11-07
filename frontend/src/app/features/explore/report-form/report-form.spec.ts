import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import { ExploreApi, ReportReason } from '../../../core/explore/explore-api';
import { ReportForm } from './report-form';

describe('ReportForm', () => {
  const report =
    vi.fn<(deckId: string, reason: ReportReason, details: string) => Observable<void>>();
  let fixture: ComponentFixture<ReportForm>;
  let host: HTMLElement;

  beforeEach(async () => {
    report.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ExploreApi, useValue: { report } }],
    });
    fixture = TestBed.createComponent(ReportForm);
    fixture.componentRef.setInput('deckId', 'd1');
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  function choose(label: string): void {
    const option = [...host.querySelectorAll('.report__reason')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!option) {
      throw new Error(`No reason named "${label}".`);
    }
    const radio = query<HTMLInputElement>(option, 'input');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    radio.dispatchEvent(new Event('input'));
  }

  async function send(): Promise<void> {
    buttonNamed(host, 'Envoyer le signalement').click();
    await settle(fixture);
  }

  it('should offer every reason, none chosen, and a way back to the deck', () => {
    expect(textOf(host, 'h1')).toBe('Signaler ce paquet');
    const reasons = [...host.querySelectorAll('.report__reason')].map((reason) =>
      reason.textContent?.trim(),
    );
    expect(reasons).toEqual([
      'Contenu choquant ou haineux',
      'Réponses fausses',
      'Spam ou publicité',
      'Contenu copié sans autorisation',
      'Autre chose',
    ]);
    expect(
      [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].some(
        (radio) => radio.checked,
      ),
    ).toBe(false);
    expect(linkNamed(host, 'Retour au paquet').getAttribute('href')).toBe('/explore/d1');
  });

  it('should ask for a reason and send nothing without one', async () => {
    await send();

    expect(textOf(host, '#report-reason-error')).toBe('Choisis un motif.');
    expect(query(host, 'fieldset').getAttribute('aria-describedby')).toBe('report-reason-error');
    expect(report).not.toHaveBeenCalled();
  });

  it('should refuse details longer than 500 characters', async () => {
    choose('Autre chose');
    typeInto(host, '#report-details', 'a'.repeat(501));

    await send();

    expect(textOf(host, '#report-details-error')).toBe('500 caractères maximum.');
    expect(report).not.toHaveBeenCalled();
  });

  it('should send the reason and trimmed details, then thank the learner', async () => {
    choose('Réponses fausses');
    typeInto(host, '#report-details', '  La carte 3 est fausse  ');

    await send();

    expect(report).toHaveBeenCalledExactlyOnceWith('d1', 'incorrect', 'La carte 3 est fausse');
    expect(textOf(host, 'h1')).toBe('Merci pour ton signalement');
    expect(document.activeElement).toBe(query(host, 'h1'));
    expect(host.querySelector('form')).toBeNull();
    expect(linkNamed(host, "Retour à l'Explorer").getAttribute('href')).toBe('/explore');
  });

  it('should send a report without details', async () => {
    choose('Spam ou publicité');

    await send();

    expect(report).toHaveBeenCalledExactlyOnceWith('d1', 'spam', '');
  });

  it.each([
    [404, "Ce paquet n'est plus publié."],
    [500, "Le signalement n'a pas été envoyé. Réessaie dans un instant."],
  ])('should explain a %s answer and keep the form', async (status, message) => {
    report.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    choose('Contenu choquant ou haineux');

    await send();

    expect(textOf(host, '.page__actions [role="alert"]')).toBe(message);
    expect(host.querySelector('form')).not.toBeNull();
    expect(buttonNamed(host, 'Envoyer le signalement').disabled).toBe(false);
  });
});
