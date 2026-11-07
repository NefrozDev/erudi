import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import { Deck, DecksApi } from '../../../core/decks/decks-api';
import { ExploreApi, Publication, PublicationContent } from '../../../core/explore/explore-api';
import { PublishForm } from './publish-form';

describe('PublishForm', () => {
  const decks: Deck[] = [
    { id: 'd1', name: 'Permis', cardCount: 12, dueCount: 0, level: 2, published: false },
    { id: 'd2', name: 'Anglais', cardCount: 30, dueCount: 3, level: 3, published: true },
    { id: 'd3', name: 'Brouillon', cardCount: 0, dueCount: 0, level: 0, published: false },
  ];
  const publication: Publication = {
    title: 'Verbes irréguliers',
    category: 'languages',
    description: 'Les 150 verbes à connaître',
    publishedAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  };
  const list = vi.fn<() => Observable<Deck[]>>();
  const explore = {
    getPublication: vi.fn<(deckId: string) => Observable<Publication>>(),
    publish: vi.fn<(deckId: string, content: PublicationContent) => Observable<Publication>>(),
    unpublish: vi.fn<(deckId: string) => Observable<void>>(),
  };
  let fixture: ComponentFixture<PublishForm>;
  let host: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    list.mockReset().mockReturnValue(of(decks));
    explore.getPublication.mockReset().mockReturnValue(of(publication));
    explore.publish.mockReset().mockReturnValue(of(publication));
    explore.unpublish.mockReset().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DecksApi, useValue: { list } },
        { provide: ExploreApi, useValue: explore },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  async function render(deckId?: string): Promise<void> {
    fixture = TestBed.createComponent(PublishForm);
    if (deckId !== undefined) {
      fixture.componentRef.setInput('deckId', deckId);
    }
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  async function pick(selector: string, value: string): Promise<void> {
    const select = query<HTMLSelectElement>(host, selector);
    select.value = value;
    select.dispatchEvent(new Event('input'));
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
  }

  async function submit(): Promise<void> {
    query<HTMLButtonElement>(host, 'button[type="submit"]').click();
    await settle(fixture);
  }

  function value(selector: string): string {
    return query<HTMLInputElement>(host, selector).value;
  }

  it("should list the learner's decks to choose from, empty ones disabled (screen 16)", async () => {
    await render();

    expect(list).toHaveBeenCalledTimes(1);
    expect(textOf(host, 'h1')).toBe('Publier un paquet');
    const options = [...query<HTMLSelectElement>(host, '#publish-deck').options].map((option) => [
      option.textContent?.trim(),
      option.disabled,
    ]);
    expect(options).toEqual([
      ['Choisir un paquet', true],
      ['Permis', false],
      ['Anglais', false],
      ['Brouillon (vide)', true],
    ]);
    expect(value('#publish-deck')).toBe('');
    expect(value('#publish-title')).toBe('');
    expect(linkNamed(host, 'Mes paquets').getAttribute('href')).toBe('/');
    expect(textOf(host, 'p.subtitle')).toContain('Ton pseudo sera visible comme auteur.');
    expect(explore.getPublication).not.toHaveBeenCalled();
  });

  it('should ask for a deck and a category, sending nothing', async () => {
    await render();

    await submit();

    expect(textOf(host, '#publish-deck-error')).toBe('Choisis un paquet.');
    expect(query(host, '#publish-deck').getAttribute('aria-invalid')).toBe('true');
    expect(textOf(host, '#publish-category-error')).toBe('Choisis une catégorie.');
    expect(explore.publish).not.toHaveBeenCalled();
  });

  it('should start from the deck given in the address, titled with its name', async () => {
    await render('d1');

    expect(value('#publish-deck')).toBe('d1');
    expect(value('#publish-title')).toBe('Permis');
    expect(value('#publish-category')).toBe('');
    expect(buttonNamed(host, 'Publier')).toBeTruthy();
    expect(host.textContent).not.toContain("Retirer de l'Explorer");
  });

  it('should publish the chosen deck, then show it as others see it', async () => {
    await render();
    await pick('#publish-deck', 'd1');
    expect(value('#publish-title')).toBe('Permis');

    typeInto(host, '#publish-title', 'Code de la route – Belgique');
    await pick('#publish-category', 'driving');
    typeInto(host, '#publish-description', 'Panneaux et priorités');
    await submit();

    expect(explore.publish).toHaveBeenCalledExactlyOnceWith('d1', {
      title: 'Code de la route – Belgique',
      category: 'driving',
      description: 'Panneaux et priorités',
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/explore', 'd1'], { replaceUrl: true });
  });

  it.each([
    ['#publish-title', ' ', '#publish-title-error', 'Ce champ est obligatoire.'],
    ['#publish-title', 'a'.repeat(61), '#publish-title-error', '60 caractères maximum.'],
    [
      '#publish-description',
      'a'.repeat(301),
      '#publish-description-error',
      '300 caractères maximum.',
    ],
  ])('should refuse %s set to %j', async (field, text, errorId, message) => {
    await render('d1');
    await pick('#publish-category', 'driving');

    typeInto(host, field, text);
    await submit();

    expect(textOf(host, errorId)).toBe(message);
    expect(explore.publish).not.toHaveBeenCalled();
  });

  it('should fill in the current publication of a published deck, to update it', async () => {
    await render('d2');

    expect(explore.getPublication).toHaveBeenCalledExactlyOnceWith('d2');
    expect(textOf(host, 'h1')).toBe('Modifier la publication');
    expect(value('#publish-title')).toBe('Verbes irréguliers');
    expect(value('#publish-category')).toBe('languages');
    expect(value('#publish-description')).toBe('Les 150 verbes à connaître');

    typeInto(host, '#publish-description', 'Les 200 verbes');
    buttonNamed(host, 'Mettre à jour').click();
    await settle(fixture);

    expect(explore.publish).toHaveBeenCalledExactlyOnceWith('d2', {
      title: 'Verbes irréguliers',
      category: 'languages',
      description: 'Les 200 verbes',
    });
  });

  it('should fill the fields in again when another deck is chosen', async () => {
    await render('d2');

    await pick('#publish-deck', 'd1');

    expect(value('#publish-title')).toBe('Permis');
    expect(value('#publish-category')).toBe('');
    expect(value('#publish-description')).toBe('');
    expect(explore.getPublication).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, 'Ajoute au moins une carte à ce paquet avant de le publier.'],
    [404, "Ce paquet n'existe plus."],
    [500, "L'enregistrement a échoué. Réessaie dans un instant."],
  ])('should explain a %s answer and stay', async (status, message) => {
    explore.publish.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    await render('d1');
    await pick('#publish-category', 'driving');

    await submit();

    expect(textOf(host, '.page__actions [role="alert"]')).toBe(message);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should withdraw a published deck once confirmed, then open the deck', async () => {
    await render('d2');

    buttonNamed(host, "Retirer de l'Explorer").click();
    await settle(fixture);
    expect(textOf(host, 'app-delete-confirmation [role="alert"]')).toBe(
      "Retirer « Verbes irréguliers » de l'Explorer ? Les copies déjà ajoutées restent chez leurs propriétaires.",
    );
    expect(explore.unpublish).not.toHaveBeenCalled();

    buttonNamed(host, 'Oui, retirer').click();
    await settle(fixture);

    expect(explore.unpublish).toHaveBeenCalledExactlyOnceWith('d2');
    expect(explore.publish).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/decks', 'd2'], { replaceUrl: true });
  });

  it('should keep the form when withdrawing fails', async () => {
    explore.unpublish.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await render('d2');

    buttonNamed(host, "Retirer de l'Explorer").click();
    await settle(fixture);
    buttonNamed(host, 'Oui, retirer').click();
    await settle(fixture);

    expect(textOf(host, '.page__actions [role="alert"]')).toBe(
      "L'enregistrement a échoué. Réessaie dans un instant.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should invite to create a deck first when there is none', async () => {
    list.mockReturnValue(of([]));

    await render();

    expect(textOf(host, '.state-card__title')).toBe('Aucun paquet à publier');
    expect(linkNamed(host, 'Créer un paquet').getAttribute('href')).toBe('/decks/new');
    expect(host.querySelector('form')).toBeNull();
  });

  it('should load the publication again after a failure', async () => {
    explore.getPublication.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );

    await render('d2');
    expect(host.querySelector('#publish-title')).toBeNull();
    expect(query<HTMLButtonElement>(host, 'button[type="submit"]').disabled).toBe(true);

    buttonNamed(host, 'Réessayer').click();
    await settle(fixture);

    expect(explore.getPublication).toHaveBeenCalledTimes(2);
    expect(value('#publish-title')).toBe('Verbes irréguliers');
  });
});
