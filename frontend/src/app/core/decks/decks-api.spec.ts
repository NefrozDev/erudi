import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { Card, Deck, DecksApi } from './decks-api';

describe('DecksApi', () => {
  const deck: Deck = {
    id: 'd1',
    name: 'Anglais',
    cardCount: 3,
    dueCount: 1,
    level: 2,
    published: false,
  };
  const card: Card = { id: 'c1', deckId: 'd1', front: 'to run out of', back: 'manquer de', box: 1 };
  let api: DecksApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DecksApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  async function call<T>(
    observable: Observable<T>,
    method: string,
    url: string,
    response: object | null,
  ): Promise<{ result: T; body: unknown }> {
    const result = firstValueFrom(observable);
    const request = controller.expectOne({ method, url });
    request.flush(response);
    return { result: await result, body: request.request.body };
  }

  it('should list the decks', async () => {
    expect((await call(api.list(), 'GET', '/api/decks', [deck])).result).toEqual([deck]);
  });

  it('should get, create, rename and delete a deck', async () => {
    expect((await call(api.get('d1'), 'GET', '/api/decks/d1', deck)).result).toEqual(deck);

    const created = await call(api.create('Anglais'), 'POST', '/api/decks', deck);
    expect(created).toEqual({ result: deck, body: { name: 'Anglais' } });

    const renamed = await call(api.rename('d1', 'English'), 'PUT', '/api/decks/d1', deck);
    expect(renamed.body).toEqual({ name: 'English' });

    await call(api.delete('d1'), 'DELETE', '/api/decks/d1', null);
  });

  it("should list and add a deck's cards", async () => {
    const summary = { id: 'c1', front: 'to run out of', box: 1 };
    expect(
      (await call(api.listCards('d1'), 'GET', '/api/decks/d1/cards', [summary])).result,
    ).toEqual([summary]);

    const content = { front: 'to run out of', back: 'manquer de' };
    const added = await call(api.addCard('d1', content), 'POST', '/api/decks/d1/cards', card);
    expect(added).toEqual({ result: card, body: content });
  });

  it('should get, update and delete a card', async () => {
    expect((await call(api.getCard('c1'), 'GET', '/api/cards/c1', card)).result).toEqual(card);

    const content = { front: 'to run out of', back: 'être à court de' };
    const updated = await call(api.updateCard('c1', content), 'PUT', '/api/cards/c1', card);
    expect(updated.body).toEqual(content);

    await call(api.deleteCard('c1'), 'DELETE', '/api/cards/c1', null);
  });

  it('should keep an id from the address bar inside its path segment', async () => {
    // expectOne in call() fails unless the URL is exactly the encoded one.
    const deleted = await call(
      api.delete('../auth/logout'),
      'DELETE',
      '/api/decks/..%2Fauth%2Flogout',
      null,
    );
    expect(deleted.result).toBeNull();
    expect((await call(api.getCard('a?b#c'), 'GET', '/api/cards/a%3Fb%23c', card)).result).toEqual(
      card,
    );
  });
});
