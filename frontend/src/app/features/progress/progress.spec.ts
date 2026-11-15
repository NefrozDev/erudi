import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, settle, textOf } from '../../../testing/dom';
import { provideRouter } from '@angular/router';
import { Deck, DecksApi } from '../../core/decks/decks-api';
import { StudyApi, StudySummary } from '../../core/study/study-api';
import { Progress } from './progress';

describe('Progress', () => {
  const summary = vi.fn<() => Observable<StudySummary>>();
  const list = vi.fn<() => Observable<Deck[]>>();
  const deck = (id: string, name: string, cardCount: number, masteredCount: number): Deck => ({
    id,
    name,
    cardCount,
    dueCount: 0,
    level: 1,
    published: false,
    masteredCount,
  });
  let fixture: ComponentFixture<Progress>;

  beforeEach(() => {
    summary
      .mockReset()
      .mockReturnValue(of({ reviewedToday: 2, dueCount: 5, boxes: [30, 28, 1, 0, 18] }));
    list
      .mockReset()
      .mockReturnValue(
        of([deck('d1', 'Anglais', 8, 2), deck('d2', 'Vide', 0, 0), deck('d3', 'Histoire', 3, 3)]),
      );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: StudyApi, useValue: { summary } },
        { provide: DecksApi, useValue: { list } },
      ],
    });
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

  describe('per deck', () => {
    function deckRows(host: HTMLElement): string[][] {
      return [...host.querySelectorAll<HTMLAnchorElement>('.progress__deck')].map((row) => [
        textOf(row, '.progress__deck-name'),
        textOf(row, '.progress__deck-count'),
        row.querySelector<HTMLElement>('.progress__bar-fill')?.style.width ?? '',
        row.getAttribute('href') ?? '',
      ]);
    }

    it('should show the mastered share of each deck with cards, linking to it', async () => {
      const host = await render();

      expect(list).toHaveBeenCalledTimes(1);
      expect(textOf(host, 'h2')).toBe('Par paquet');
      expect(deckRows(host)).toEqual([
        ['Anglais', '2 / 8 maîtrisées', '25%', '/decks/d1'],
        ['Histoire', '3 / 3 maîtrisées', '100%', '/decks/d3'],
      ]);
      expect(host.querySelector('.progress__bar')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('should leave the section out without a deck holding cards', async () => {
      list.mockReturnValue(of([deck('d2', 'Vide', 0, 0)]));

      const host = await render();

      expect(host.querySelector('.progress__decks')).toBeNull();
      expect(rows(host)).toHaveLength(5);
    });

    it('should keep the boxes when the decks fail, and load the decks again on demand', async () => {
      list.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

      const host = await render();
      expect(rows(host)).toHaveLength(5);
      buttonNamed(host, 'Réessayer').click();
      await settle(fixture);

      expect(list).toHaveBeenCalledTimes(2);
      expect(summary).toHaveBeenCalledTimes(1);
      expect(deckRows(host)).toHaveLength(2);
    });
  });
});
