import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { Deck } from '../decks/decks-api';
import { ExploreApi, PublicDeck, Publication } from './explore-api';

describe('ExploreApi', () => {
  const publicDeck: PublicDeck = {
    id: 'd1',
    title: 'Code de la route',
    category: 'driving',
    author: 'marie',
    cardCount: 2,
    useCount: 5,
    description: 'Panneaux',
    updatedAt: '2026-11-04T10:00:00Z',
    preview: { front: 'Triangle ?', back: 'Cédez le passage' },
    isMine: false,
    bestScore: null,
  };
  const publication: Publication = {
    title: 'Code de la route',
    category: 'driving',
    description: 'Panneaux',
    publishedAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-04T10:00:00Z',
  };
  let api: ExploreApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ExploreApi);
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

  it('should search without parameters, or with the text and category given', async () => {
    expect((await call(api.search({}), 'GET', '/api/explore', [])).result).toEqual([]);
    await call(api.search({ text: '', category: undefined }), 'GET', '/api/explore', []);
    await call(
      api.search({ text: 'verbes & co', category: 'languages' }),
      'GET',
      '/api/explore?q=verbes%20%26%20co&category=languages',
      [],
    );
  });

  it('should get a public deck and its test cards', async () => {
    expect((await call(api.get('d1'), 'GET', '/api/explore/d1', publicDeck)).result).toEqual(
      publicDeck,
    );
    await call(api.testCards('d1'), 'GET', '/api/explore/d1/test', []);
  });

  it('should save a result, copy and report a deck', async () => {
    const result = await call(api.saveResult('d1', 3, 4), 'POST', '/api/explore/d1/results', {
      score: 75,
      bestScore: 80,
    });
    expect(result).toEqual({ result: { score: 75, bestScore: 80 }, body: { known: 3, total: 4 } });

    const copy: Deck = {
      id: 'd9',
      name: 'Code de la route',
      cardCount: 2,
      dueCount: 2,
      level: 1,
      published: false,
    };
    expect((await call(api.copy('d1'), 'POST', '/api/explore/d1/copies', copy)).result).toEqual(
      copy,
    );

    const report = await call(
      api.report('d1', 'incorrect', 'La carte 3'),
      'POST',
      '/api/explore/d1/reports',
      null,
    );
    expect(report.body).toEqual({ reason: 'incorrect', details: 'La carte 3' });
  });

  it("should read, publish and unpublish the learner's deck", async () => {
    await call(api.getPublication('d1'), 'GET', '/api/decks/d1/publication', publication);
    const content = { title: 'Code', category: 'driving' as const, description: '' };
    expect(
      (await call(api.publish('d1', content), 'PUT', '/api/decks/d1/publication', publication))
        .body,
    ).toEqual(content);
    await call(api.unpublish('d1'), 'DELETE', '/api/decks/d1/publication', null);
  });

  it('should encode ids taken from the address bar', async () => {
    // expectOne in call() fails unless the URL is exactly the encoded one.
    expect(
      (await call(api.get('../decks'), 'GET', '/api/explore/..%2Fdecks', publicDeck)).result,
    ).toEqual(publicDeck);
    const unpublished = await call(
      api.unpublish('a/b'),
      'DELETE',
      '/api/decks/a%2Fb/publication',
      null,
    );
    expect(unpublished.result).toBeNull();
  });
});
