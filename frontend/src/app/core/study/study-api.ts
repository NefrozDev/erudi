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

/** Which cards a session asks. Every deck, at the API's default size, when empty. */
export interface StudyFilter {
  deckId?: string;
  /** 1 to {@link MAX_SESSION_SIZE}. */
  count?: number;
  /** Practice only: the cards of this box. */
  box?: number;
  /** Practice only: the cards whose last quiz answer was "I did not know". */
  failed?: boolean;
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

  /**
   * The most urgent due cards for a quiz, random ones for practice: by default 50 and 20.
   * Fails with 404 when the deck is not the learner's.
   */
  cards(mode: StudyMode, filter: StudyFilter = {}): Observable<StudyCard[]> {
    let params = new HttpParams();
    if (filter.deckId !== undefined) params = params.set('deckId', filter.deckId);
    if (filter.count !== undefined) params = params.set('count', filter.count);
    if (mode === 'practice' && filter.box !== undefined) params = params.set('box', filter.box);
    if (mode === 'practice' && filter.failed) params = params.set('failed', true);
    return this.http.get<StudyCard[]>(`/api/study/${mode}`, { params });
  }

  /** A quiz answer. Fails with 409 when the card was already answered, e.g. in another tab. */
  answer(cardId: string, knew: boolean): Observable<AnswerResult> {
    return this.http.post<AnswerResult>('/api/study/answers', { cardId, knew });
  }
}

/** Which side a session asks: the front (the default), the back, or either, card by card. */
export type CardDirection = 'front' | 'back' | 'mixed';

/** The most due cards a quiz asks by default; the learner can then go on with the next ones. */
export const QUIZ_SIZE = 50;

/** The most cards one session can ask (the API's limit): a whole deck. */
export const MAX_SESSION_SIZE = 2000;

/** The sizes a learner picks from; `all` asks {@link MAX_SESSION_SIZE}. */
export const SESSION_SIZES = [10, 20, 50, 100, 'all'] as const;
export type SessionSize = (typeof SESSION_SIZES)[number];
