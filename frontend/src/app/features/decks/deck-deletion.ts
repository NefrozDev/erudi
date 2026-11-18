import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../core/api/api-errors';
import { DecksApi } from '../../core/decks/decks-api';

/**
 * Deletes a deck with its cards. The API removes them from every list, quiz and count at once.
 * @returns `true` once the deck is gone, including when another device deleted it first (404).
 */
export async function deleteDeck(api: DecksApi, deckId: string): Promise<boolean> {
  try {
    await firstValueFrom(api.delete(deckId));
    return true;
  } catch (error) {
    return httpStatus(error) === 404;
  }
}
