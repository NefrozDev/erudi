import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * `quiz` asks the due cards and moves them between the Leitner boxes; `practice` asks random
 * cards, due or not, and moves nothing.
 */
export type StudyMode = 'quiz' | 'practice';

export interface StudySummary {
  /** Quiz answers given today. */
  reviewedToday: number;
  /** Cards the quiz still asks today, in every deck. */
  dueCount: number;
  /** How many cards each box holds, from box 1 to box 5. */
  boxes: number[];
}

export interface StudyCard {
  id: string;
  deckId: string;
  deckName: string;
  front: string;
  back: string;
  box: number;
}

export interface AnswerResult {
  box: number;
  /** The learner's day the card comes back, as `yyyy-MM-dd`. */
  dueOn: string;
}

@Injectable({ providedIn: 'root' })
export class StudyApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<StudySummary> {
    return this.http.get<StudySummary>('/api/study/summary');
  }

  /** At most 50 due cards for a quiz, 20 random ones for practice; from one deck or all. */
  cards(mode: StudyMode, deckId?: string): Observable<StudyCard[]> {
    const params = deckId === undefined ? undefined : new HttpParams().set('deckId', deckId);
    return this.http.get<StudyCard[]>(`/api/study/${mode}`, { params });
  }

  /** A quiz answer. Fails with 409 when the card was already answered, e.g. in another tab. */
  answer(cardId: string, knew: boolean): Observable<AnswerResult> {
    return this.http.post<AnswerResult>('/api/study/answers', { cardId, knew });
  }
}
