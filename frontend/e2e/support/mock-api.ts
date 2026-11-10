import type { Page, Route } from '@playwright/test';

/** Who the API says is signed in: nobody, a newcomer who has not accepted the terms, or a learner. */
export type Session = 'signed-out' | 'terms-pending' | 'learner';

export interface MockOptions {
  session?: Session;
  /** No decks at all: the empty states of home, publish and the study screens. */
  noDecks?: boolean;
  /** The first deck holds no cards. */
  emptyDeck?: boolean;
  /** The Explorer finds nothing. */
  noResults?: boolean;
  /** The intro was already seen on this device, so signing out leads to the sign-in screen. */
  introSeen?: boolean;
}

const user = (termsAccepted: boolean) => ({
  id: 'u1',
  username: 'Nefroz',
  email: 'nefroz@example.com',
  termsAccepted,
});

const decks = [
  {
    id: 'd1',
    name: 'Anglais : verbes irréguliers',
    cardCount: 3,
    dueCount: 2,
    level: 2,
    published: true,
  },
  { id: 'd2', name: 'Code de la route', cardCount: 2, dueCount: 0, level: 4, published: false },
];

const cards = [
  { id: 'c1', deckId: 'd1', front: 'to be', back: 'être', box: 1 },
  { id: 'c2', deckId: 'd1', front: 'to have', back: 'avoir', box: 2 },
  { id: 'c3', deckId: 'd1', front: 'to go', back: 'aller', box: 3 },
];

const publicDeck = {
  id: 'p1',
  title: 'Capitales européennes',
  category: 'studies',
  author: 'Ada',
  cardCount: 40,
  useCount: 2300,
};

/** Answers every /api call the app makes, like the real API would for these data. */
export async function mockApi(page: Page, options: MockOptions = {}): Promise<void> {
  const session = options.session ?? 'learner';
  const myDecks = options.noDecks ? [] : decks;

  if (options.introSeen ?? true) {
    await page.addInitScript(() => localStorage.setItem('erudi.onboarding-seen', 'true'));
  }

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const notFound = () =>
      route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Not Found', status: 404 }),
      });

    if (pathname === '/api/auth/session') {
      return session === 'signed-out'
        ? route.fulfill({ status: 401 })
        : json(user(session === 'learner'));
    }
    if (pathname === '/api/account/terms' && method === 'POST') return json(user(true));
    if (pathname === '/api/auth/logout') return json({ redirectTo: '/sign-in' });

    if (pathname === '/api/decks' && method === 'GET') return json(myDecks);
    if (pathname === '/api/decks' && method === 'POST') return json({ ...decks[0], id: 'd9' }, 201);

    const deck = /^\/api\/decks\/([^/]+)(\/.*)?$/.exec(pathname);
    if (deck) {
      const found = myDecks.find((d) => d.id === decodeURIComponent(deck[1]));
      if (!found) return notFound();
      const rest = deck[2] ?? '';
      if (rest === '') return json(found);
      if (rest === '/cards' && method === 'GET') {
        const own = options.emptyDeck && found.id === 'd1' ? [] : cards;
        return json(own.map(({ id, front, box }) => ({ id, front, box })));
      }
      if (rest === '/cards' && method === 'POST') return json(cards[0], 201);
      if (rest === '/publication' && method === 'GET') {
        return found.published
          ? json({
              title: 'Verbes irréguliers',
              category: 'languages',
              description: 'Les 100 verbes les plus courants.',
              publishedAt: '2026-10-01T08:00:00Z',
              updatedAt: '2026-11-01T08:00:00Z',
            })
          : notFound();
      }
      return json(null);
    }

    const card = /^\/api\/cards\/([^/]+)$/.exec(pathname);
    if (card) {
      const found = cards.find((c) => c.id === decodeURIComponent(card[1]));
      return found ? json(found) : notFound();
    }

    if (pathname === '/api/study/summary') {
      return json(
        options.noDecks
          ? { reviewedToday: 0, dueCount: 0, boxes: [0, 0, 0, 0, 0] }
          : { reviewedToday: 4, dueCount: 2, boxes: [1, 1, 1, 0, 2] },
      );
    }
    if (pathname === '/api/study/quiz' || pathname === '/api/study/practice') {
      return json(
        options.noDecks ? [] : cards.slice(0, 2).map((c) => ({ ...c, deckName: decks[0].name })),
      );
    }
    if (pathname === '/api/study/answers') return json({ box: 2, dueOn: '2026-11-12' });

    if (pathname === '/api/explore') return json(options.noResults ? [] : [publicDeck]);
    const explore = /^\/api\/explore\/([^/]+)(\/.*)?$/.exec(pathname);
    if (explore) {
      if (decodeURIComponent(explore[1]) !== publicDeck.id) return notFound();
      const rest = explore[2] ?? '';
      if (rest === '') {
        return json({
          ...publicDeck,
          description: 'Les capitales des pays d’Europe.',
          updatedAt: '2026-11-01T08:00:00Z',
          preview: { front: 'Belgique', back: 'Bruxelles' },
          isMine: false,
          bestScore: 80,
        });
      }
      if (rest === '/test') {
        return json([
          { id: 't1', deckName: publicDeck.title, front: 'Belgique', back: 'Bruxelles' },
          { id: 't2', deckName: publicDeck.title, front: 'Irlande', back: 'Dublin' },
        ]);
      }
      if (rest === '/results') return json({ score: 50, bestScore: 80 });
      if (rest === '/copies') return json({ ...decks[0], id: 'd8' }, 201);
      if (rest === '/reports') return route.fulfill({ status: 204 });
    }

    return notFound();
  });
}
