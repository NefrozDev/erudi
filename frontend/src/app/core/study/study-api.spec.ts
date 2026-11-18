import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { StudyApi, StudyCard } from './study-api';

describe('StudyApi', () => {
  const card: StudyCard = {
    id: 'c1',
    deckId: 'd1',
    deckName: 'Anglais',
    front: 'to run out of',
    back: 'manquer de',
    box: 2,
  };
  let api: StudyApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(StudyApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('should get the summary', async () => {
    const summary = { reviewedToday: 3, dueCount: 9, boxes: [4, 3, 2, 1, 0] };
    const result = firstValueFrom(api.summary());

    controller.expectOne({ method: 'GET', url: '/api/study/summary' }).flush(summary);

    expect(await result).toEqual(summary);
  });

  it.each(['quiz', 'practice'] as const)('should get the %s cards of every deck', async (mode) => {
    const result = firstValueFrom(api.cards(mode));

    const request = controller.expectOne(`/api/study/${mode}`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush([card]);

    expect(await result).toEqual([card]);
  });

  it("should get one deck's cards, without letting the id add a parameter", async () => {
    const result = firstValueFrom(api.cards('quiz', { deckId: 'd1&deckId=d2' }));

    const request = controller.expectOne((r) => r.url === '/api/study/quiz');
    expect(request.request.params.getAll('deckId')).toEqual(['d1&deckId=d2']);
    // "&" is encoded, so the API reads a single deckId (an "=" inside a value is harmless).
    expect(request.request.urlWithParams).toBe('/api/study/quiz?deckId=d1%26deckId=d2');
    request.flush([]);

    expect(await result).toEqual([]);
  });

  it('should ask for a number of cards', async () => {
    const result = firstValueFrom(api.cards('quiz', { deckId: 'd1', count: 100 }));

    const request = controller.expectOne((r) => r.url === '/api/study/quiz');
    expect(request.request.urlWithParams).toBe('/api/study/quiz?deckId=d1&count=100');
    request.flush([card]);

    expect(await result).toEqual([card]);
  });

  it('should practise one box or the failed cards only', async () => {
    const result = firstValueFrom(api.cards('practice', { count: 10, box: 3, failed: true }));

    const request = controller.expectOne((r) => r.url === '/api/study/practice');
    expect(request.request.urlWithParams).toBe('/api/study/practice?count=10&box=3&failed=true');
    request.flush([]);

    expect(await result).toEqual([]);
  });

  it('should leave the box and failed filters out of a quiz, and send no false filter', () => {
    api.cards('quiz', { box: 3, failed: true }).subscribe();
    api.cards('practice', { failed: false }).subscribe();

    const quiz = controller.expectOne('/api/study/quiz');
    const practice = controller.expectOne('/api/study/practice');
    expect(quiz.request.params.keys()).toEqual([]);
    expect(practice.request.params.keys()).toEqual([]);
    quiz.flush([]);
    practice.flush([]);
  });

  it('should send a quiz answer', async () => {
    const result = firstValueFrom(api.answer('c1', true));

    const request = controller.expectOne({ method: 'POST', url: '/api/study/answers' });
    expect(request.request.body).toEqual({ cardId: 'c1', knew: true });
    request.flush({ box: 3, dueOn: '2026-11-11' });

    expect(await result).toEqual({ box: 3, dueOn: '2026-11-11' });
  });
});
