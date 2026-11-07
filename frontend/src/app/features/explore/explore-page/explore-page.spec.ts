import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import { ExploreApi, ExploreSearch, PublicDeckSummary } from '../../../core/explore/explore-api';
import { ExplorePage, SEARCH_DELAY_MS } from './explore-page';

describe('ExplorePage', () => {
  const decks: PublicDeckSummary[] = [
    {
      id: 'd1',
      title: 'Code de la route – Belgique',
      category: 'driving',
      author: 'Marie',
      cardCount: 420,
      useCount: 2300,
    },
    {
      id: 'd2',
      title: 'Verbes irréguliers anglais',
      category: 'languages',
      author: 'Thomas',
      cardCount: 1,
      useCount: 1,
    },
  ];
  const search = vi.fn<(search: ExploreSearch) => Observable<PublicDeckSummary[]>>();
  let fixture: ComponentFixture<ExplorePage>;
  let host: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    search.mockReset().mockReturnValue(of(decks));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ExploreApi, useValue: { search } }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  async function render(params: { q?: string; category?: string } = {}): Promise<void> {
    fixture = TestBed.createComponent(ExplorePage);
    for (const [name, value] of Object.entries(params)) {
      fixture.componentRef.setInput(name, value);
    }
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  /** Waits out the pause the page leaves after typing. */
  async function afterTyping(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS + 50));
    await settle(fixture);
  }

  function rows(): string[][] {
    return [...host.querySelectorAll('.public-deck-row')].map((row) => [
      textOf(row, '.public-deck-row__title'),
      textOf(row, '.public-deck-row__author'),
      // Only the template's line breaks and indentation: the counts keep their own spaces.
      textOf(row, '.public-deck-row__meta').replace(/[\n ]+/g, ' '),
    ]);
  }

  function chip(name: string): HTMLButtonElement {
    return buttonNamed(query(host, '.explore__chips'), name);
  }

  it('should list the most used public decks, each opening its sheet (screen 14)', async () => {
    await render();

    expect(search).toHaveBeenCalledExactlyOnceWith({ text: '', category: undefined });
    expect(textOf(host, 'h1')).toBe('Explorer');
    expect(textOf(host, 'h2')).toBe('Populaires');
    expect(rows()).toEqual([
      // French groups thousands with a narrow no-break space.
      ['Code de la route – Belgique', 'par Marie', '420 cartes · 2\u202f300 utilisations'],
      ['Verbes irréguliers anglais', 'par Thomas', '1 carte · 1 utilisation'],
    ]);
    expect(linkNamed(host, 'Publier un de mes paquets').getAttribute('href')).toBe('/publish');
    const firstRow = query<HTMLAnchorElement>(host, '.public-deck-row');
    expect(firstRow.getAttribute('href')).toBe('/explore/d1');
  });

  it('should offer every category, "Tous" being chosen', async () => {
    await render();

    const chips = [...host.querySelectorAll('.explore__chips button')];
    expect(chips.map((button) => button.textContent?.trim())).toEqual([
      'Tous',
      'Langues',
      'Permis',
      'Études',
      'Autres',
    ]);
    expect(chips.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
  });

  it('should search the typed text once typing pauses, and keep it in the address', async () => {
    await render();
    search.mockClear();

    typeInto(host, '#explore-search', 'v');
    typeInto(host, '#explore-search', 'verbes ');
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS / 3));
    expect(search).not.toHaveBeenCalled();

    await afterTyping();

    expect(search).toHaveBeenCalledExactlyOnceWith({ text: 'verbes', category: undefined });
    expect(textOf(host, 'h2')).toBe('Résultats');
    expect(navigate).toHaveBeenLastCalledWith(['/explore'], {
      queryParams: { q: 'verbes' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('should drop the search from the address once the field is cleared', async () => {
    await render({ q: 'verbes' });

    typeInto(host, '#explore-search', '  ');

    expect(navigate).toHaveBeenLastCalledWith(['/explore'], {
      queryParams: { q: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('should start from the search and category in the address', async () => {
    await render({ q: 'verbes', category: 'languages' });
    await afterTyping();

    expect(query<HTMLInputElement>(host, '#explore-search').value).toBe('verbes');
    expect(chip('Langues').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Tous').getAttribute('aria-pressed')).toBe('false');
    expect(search).toHaveBeenLastCalledWith({ text: 'verbes', category: 'languages' });
  });

  it('should ignore an unknown category in the address', async () => {
    await render({ category: '<script>' });

    expect(search).toHaveBeenCalledExactlyOnceWith({ text: '', category: undefined });
    expect(chip('Tous').getAttribute('aria-pressed')).toBe('true');
  });

  it('should put a chosen category in the address, and "Tous" removes it', async () => {
    await render();

    chip('Permis').click();
    expect(navigate).toHaveBeenLastCalledWith(['/explore'], {
      queryParams: { category: 'driving' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    chip('Tous').click();
    expect(navigate).toHaveBeenLastCalledWith(['/explore'], {
      queryParams: { category: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('should load the category from the address straight away', async () => {
    await render({ category: 'driving' });

    expect(search).toHaveBeenCalledExactlyOnceWith({ text: '', category: 'driving' });
    expect(textOf(host, 'h2')).toBe('Résultats');
  });

  it('should say when nothing matches', async () => {
    search.mockReturnValue(of([]));

    await render({ category: 'studies' });

    expect(textOf(host, '.state-card__title')).toBe('Aucun paquet trouvé');
    expect(host.querySelector('.public-deck-row')).toBeNull();
  });

  it('should invite to publish when the library is empty', async () => {
    search.mockReturnValue(of([]));

    await render();

    expect(textOf(host, '.state-card__title')).toBe('La bibliothèque est encore vide');
    expect(linkNamed(host, 'Publier un de mes paquets')).toBeTruthy();
  });

  it('should load again after a failure', async () => {
    search.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));

    await render();
    expect(textOf(host, '[role="alert"] p')).toBe(
      'Impossible de charger cette page. Vérifie ta connexion.',
    );

    buttonNamed(host, 'Réessayer').click();
    await settle(fixture);

    expect(search).toHaveBeenCalledTimes(2);
    expect(rows()).toHaveLength(2);
  });
});
