import { expect, type Page } from '@playwright/test';
import { mockApi, type MockOptions } from './mock-api';

export interface Screen {
  name: string;
  url: string;
  mock?: MockOptions;
  /** Brings the screen to the state to check, once it has loaded. */
  act?: (page: Page) => Promise<void>;
}

// Every screen, in each of its states that shows something different.
export const screens: Screen[] = [
  {
    name: 'intro, first slide',
    url: '/welcome',
    mock: { session: 'signed-out', introSeen: false },
  },
  {
    name: 'intro, last slide',
    url: '/welcome',
    mock: { session: 'signed-out', introSeen: false },
    act: async (page) => {
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.getByRole('button', { name: 'Suivant' }).click();
    },
  },
  { name: 'sign-in', url: '/sign-in', mock: { session: 'signed-out' } },
  { name: 'sign-in cancelled', url: '/sign-in?signIn=cancelled', mock: { session: 'signed-out' } },
  { name: 'terms', url: '/terms', mock: { session: 'signed-out' } },
  { name: 'accept terms', url: '/accept-terms', mock: { session: 'terms-pending' } },
  { name: 'home', url: '/' },
  { name: 'home without decks', url: '/', mock: { noDecks: true } },
  { name: 'explore', url: '/explore' },
  { name: 'explore without results', url: '/explore?q=zzz', mock: { noResults: true } },
  { name: 'progress', url: '/progress' },
  { name: 'progress without decks', url: '/progress', mock: { noDecks: true } },
  { name: 'settings', url: '/settings' },
  { name: 'new deck', url: '/decks/new' },
  {
    name: 'new deck with an error',
    url: '/decks/new',
    act: async (page) => {
      await page.getByRole('button', { name: 'Enregistrer' }).click();
    },
  },
  { name: 'deck', url: '/decks/d1' },
  { name: 'empty deck', url: '/decks/d1', mock: { emptyDeck: true } },
  { name: 'deck not found', url: '/decks/nope' },
  { name: 'edit deck', url: '/decks/d1/edit' },
  {
    name: 'edit deck, deleting',
    url: '/decks/d1/edit',
    act: async (page) => {
      await page.getByRole('button', { name: 'Supprimer le paquet' }).click();
    },
  },
  { name: 'new card', url: '/decks/d1/cards/new' },
  { name: 'edit card', url: '/decks/d1/cards/c1' },
  { name: 'quiz, question', url: '/study/quiz' },
  {
    name: 'quiz, answer',
    url: '/study/quiz',
    act: async (page) => {
      await page.getByRole('button', { name: 'Retourner la carte' }).click();
    },
  },
  {
    name: 'quiz, done',
    url: '/study/quiz',
    act: async (page) => {
      for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: 'Retourner la carte' }).click();
        await page.getByRole('button', { name: 'Je savais' }).click();
      }
      await expect(page.getByText('Bravo !')).toBeVisible();
    },
  },
  { name: 'quiz, nothing due', url: '/study/quiz', mock: { noDecks: true } },
  { name: 'practice', url: '/study/practice' },
  { name: 'public deck', url: '/explore/p1' },
  { name: 'public deck not found', url: '/explore/nope' },
  { name: 'public test', url: '/explore/p1/test' },
  { name: 'report', url: '/explore/p1/report' },
  {
    name: 'report with an error',
    url: '/explore/p1/report',
    act: async (page) => {
      await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
    },
  },
  {
    name: 'report sent',
    url: '/explore/p1/report',
    act: async (page) => {
      await page.getByText('Réponses fausses').click();
      await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
      await expect(page.getByText('Merci pour ton signalement')).toBeVisible();
    },
  },
  { name: 'publish', url: '/publish' },
  { name: 'publish, published deck', url: '/publish?deckId=d1' },
  { name: 'publish without decks', url: '/publish', mock: { noDecks: true } },
];

/** Opens the screen with its mocked data and brings it to its state, ready to check. */
export async function openScreen(page: Page, screen: Screen): Promise<void> {
  await mockApi(page, screen.mock);
  await page.goto(screen.url);
  // Every screen has a heading; on the study card it is only for screen readers.
  await expect(page.locator('h1, h2').first()).toBeAttached();
  await screen.act?.(page);
  await page.waitForLoadState('networkidle');
}
