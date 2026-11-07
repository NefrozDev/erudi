import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Deck {
  id: string;
  name: string;
  cardCount: number;
  /** Cards the quiz asks today. */
  dueCount: number;
  /** The average box, rounded: 0 for an empty deck, otherwise 1 to 5. */
  level: number;
}

export interface CardSummary {
  id: string;
  front: string;
  box: number;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  box: number;
}

export interface CardContent {
  front: string;
  back: string;
}

/**
 * The signed-in learner's decks and cards. Someone else's deck or card answers 404. Ids come
 * from the address bar, so they are encoded before going into a URL.
 */
@Injectable({ providedIn: 'root' })
export class DecksApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Deck[]> {
    return this.http.get<Deck[]>('/api/decks');
  }

  get(deckId: string): Observable<Deck> {
    return this.http.get<Deck>(deckUrl(deckId));
  }

  /** Fails with 409 once the account holds 200 decks. */
  create(name: string): Observable<Deck> {
    return this.http.post<Deck>('/api/decks', { name });
  }

  rename(deckId: string, name: string): Observable<Deck> {
    return this.http.put<Deck>(deckUrl(deckId), { name });
  }

  /** Deletes the deck's cards too. */
  delete(deckId: string): Observable<void> {
    return this.http.delete<void>(deckUrl(deckId));
  }

  /** In creation order. */
  listCards(deckId: string): Observable<CardSummary[]> {
    return this.http.get<CardSummary[]>(`${deckUrl(deckId)}/cards`);
  }

  /** The card starts in box 1. Fails with 409 once the deck holds 2000 cards. */
  addCard(deckId: string, content: CardContent): Observable<Card> {
    return this.http.post<Card>(`${deckUrl(deckId)}/cards`, content);
  }

  getCard(cardId: string): Observable<Card> {
    return this.http.get<Card>(cardUrl(cardId));
  }

  /** The card keeps its box. */
  updateCard(cardId: string, content: CardContent): Observable<Card> {
    return this.http.put<Card>(cardUrl(cardId), content);
  }

  deleteCard(cardId: string): Observable<void> {
    return this.http.delete<void>(cardUrl(cardId));
  }
}

function deckUrl(deckId: string): string {
  return `/api/decks/${encodeURIComponent(deckId)}`;
}

function cardUrl(cardId: string): string {
  return `/api/cards/${encodeURIComponent(cardId)}`;
}
