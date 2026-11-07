import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Deck } from '../decks/decks-api';

export type DeckCategory = 'languages' | 'driving' | 'studies' | 'other';

export type ReportReason = 'offensive' | 'incorrect' | 'spam' | 'copyright' | 'other';

export interface PublicDeckSummary {
  id: string;
  title: string;
  category: DeckCategory;
  /** The author's username. */
  author: string;
  cardCount: number;
  /** Learners, other than the author, who tested or copied the deck. */
  useCount: number;
}

export interface PublicDeck extends PublicDeckSummary {
  /** Empty when the author wrote none. */
  description: string;
  /** The last change to the cards or the publication, as an ISO date-time. */
  updatedAt: string;
  /** The first card; null once the deck has no card left. */
  preview: { front: string; back: string } | null;
  /** The signed-in learner is the author. */
  isMine: boolean;
  /** The learner's best test score in percent; null before a first test. */
  bestScore: number | null;
}

export interface TestCard {
  id: string;
  /** The publication's title. */
  deckName: string;
  front: string;
  back: string;
}

export interface TestResult {
  score: number;
  /** This test included. */
  bestScore: number;
}

export interface ExploreSearch {
  text?: string;
  category?: DeckCategory;
}

export interface PublicationContent {
  title: string;
  category: DeckCategory;
  description: string;
}

export interface Publication extends PublicationContent {
  publishedAt: string;
  updatedAt: string;
}

/**
 * The public library: every learner's side (search, test, copy, report) and the author's
 * (publishing one of their decks). A deck that is not published answers 404.
 */
@Injectable({ providedIn: 'root' })
export class ExploreApi {
  private readonly http = inject(HttpClient);

  /** The 50 most used public decks, matching the text and category when given. */
  search({ text, category }: ExploreSearch): Observable<PublicDeckSummary[]> {
    let params = new HttpParams();
    if (text) {
      params = params.set('q', text);
    }
    if (category) {
      params = params.set('category', category);
    }
    return this.http.get<PublicDeckSummary[]>('/api/explore', { params });
  }

  get(deckId: string): Observable<PublicDeck> {
    return this.http.get<PublicDeck>(publicDeckUrl(deckId));
  }

  /** 20 random cards of the deck. */
  testCards(deckId: string): Observable<TestCard[]> {
    return this.http.get<TestCard[]>(`${publicDeckUrl(deckId)}/test`);
  }

  /** `known` is the learner's own count of "Je savais". */
  saveResult(deckId: string, known: number, total: number): Observable<TestResult> {
    return this.http.post<TestResult>(`${publicDeckUrl(deckId)}/results`, { known, total });
  }

  /** Copies the deck into the learner's account. Fails with 409 at 200 decks. */
  copy(deckId: string): Observable<Deck> {
    return this.http.post<Deck>(`${publicDeckUrl(deckId)}/copies`, null);
  }

  report(deckId: string, reason: ReportReason, details: string): Observable<void> {
    return this.http.post<void>(`${publicDeckUrl(deckId)}/reports`, { reason, details });
  }

  getPublication(deckId: string): Observable<Publication> {
    return this.http.get<Publication>(publicationUrl(deckId));
  }

  /** Publishes the learner's deck or updates its publication. Fails with 409 for an empty deck. */
  publish(deckId: string, content: PublicationContent): Observable<Publication> {
    return this.http.put<Publication>(publicationUrl(deckId), content);
  }

  unpublish(deckId: string): Observable<void> {
    return this.http.delete<void>(publicationUrl(deckId));
  }
}

function publicDeckUrl(deckId: string): string {
  return `/api/explore/${encodeURIComponent(deckId)}`;
}

function publicationUrl(deckId: string): string {
  return `/api/decks/${encodeURIComponent(deckId)}/publication`;
}
