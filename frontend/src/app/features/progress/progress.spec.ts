import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, settle, textOf } from '../../../testing/dom';
import { StudyApi, StudySummary } from '../../core/study/study-api';
import { Progress } from './progress';

describe('Progress', () => {
  const summary = vi.fn<() => Observable<StudySummary>>();
  let fixture: ComponentFixture<Progress>;

  beforeEach(() => {
    summary
      .mockReset()
      .mockReturnValue(of({ reviewedToday: 2, dueCount: 5, boxes: [30, 28, 1, 0, 18] }));
    TestBed.configureTestingModule({ providers: [{ provide: StudyApi, useValue: { summary } }] });
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(Progress);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function rows(host: HTMLElement): string[][] {
    return [...host.querySelectorAll('.progress__box')].map((box) => [
      textOf(box, '.progress__box-name'),
      textOf(box, '.progress__box-interval'),
      textOf(box, '.progress__count').replace(/\s+/g, ' '),
    ]);
  }

  it('should show each box, how often it comes back and its cards (screen 13)', async () => {
    const host = await render();

    expect(summary).toHaveBeenCalledTimes(1);
    expect(textOf(host, 'h1')).toBe('Progression');
    expect(textOf(host, '.subtitle')).toBe('77 cartes réparties dans 5 boîtes');
    expect(rows(host)).toEqual([
      ['Boîte 1', 'Chaque jour', '30 cartes'],
      ['Boîte 2', 'Tous les 2 jours', '28 cartes'],
      ['Boîte 3', 'Tous les 4 jours', '1 carte'],
      ['Boîte 4', 'Chaque semaine', '0 carte'],
      ['Boîte 5', 'Toutes les 2 semaines', '18 cartes'],
    ]);
  });

  it('should only show the number, the word being for screen readers', async () => {
    const host = await render();
    const count = host.querySelector('.progress__count');

    expect(count?.firstChild?.textContent?.trim()).toBe('30');
    expect(count?.querySelector('.visually-hidden')?.textContent?.trim()).toBe('cartes');
  });

  it('should use the singular for a single card', async () => {
    summary.mockReturnValue(of({ reviewedToday: 0, dueCount: 1, boxes: [1, 0, 0, 0, 0] }));

    const host = await render();

    expect(textOf(host, '.subtitle')).toBe('1 carte répartie dans 5 boîtes');
  });

  it('should load again after a failure', async () => {
    summary.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    const host = await render();
    expect(textOf(host, '[role="alert"] p')).toBe(
      'Impossible de charger cette page. Vérifie ta connexion.',
    );

    buttonNamed(host, 'Réessayer').click();
    await settle(fixture);

    expect(summary).toHaveBeenCalledTimes(2);
    expect(rows(host)).toHaveLength(5);
  });
});
