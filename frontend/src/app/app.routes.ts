import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard, termsPendingGuard } from './core/auth/auth-guards';

export const routes: Routes = [
  {
    path: 'welcome',
    title: 'titles.welcome',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/onboarding/intro').then((m) => m.Intro),
  },
  {
    path: 'sign-in',
    title: 'titles.signIn',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/auth/sign-in/sign-in').then((m) => m.SignIn),
  },
  {
    // The first screen after a first sign-in: Erudi's own terms.
    path: 'accept-terms',
    title: 'titles.acceptTerms',
    canActivate: [termsPendingGuard],
    loadComponent: () =>
      import('./features/auth/accept-terms/accept-terms').then((m) => m.AcceptTerms),
  },
  // Accounts, passwords and their recovery moved to the Synapse account.
  { path: 'sign-up', redirectTo: 'sign-in' },
  { path: 'forgot-password', redirectTo: 'sign-in' },
  { path: 'reset-password', redirectTo: 'sign-in' },
  {
    // Public: the terms are read before accepting them.
    path: 'terms',
    title: 'titles.terms',
    loadComponent: () => import('./features/legal/terms').then((m) => m.Terms),
  },
  {
    path: '',
    canActivate: [signedInGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/shell/tab-shell').then((m) => m.TabShell),
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'titles.home',
            loadComponent: () => import('./features/home/home').then((m) => m.Home),
          },
          {
            path: 'explore',
            title: 'titles.explore',
            loadComponent: () =>
              import('./features/explore/explore-page/explore-page').then((m) => m.ExplorePage),
          },
          {
            path: 'progress',
            title: 'titles.progress',
            loadComponent: () => import('./features/progress/progress').then((m) => m.Progress),
          },
          {
            path: 'settings',
            title: 'titles.settings',
            loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
          },
        ],
      },
      // Full-screen pages, without the bottom bar (screens 8 to 12, 15 and 16).
      {
        path: 'study/quiz',
        title: 'titles.quiz',
        data: { mode: 'quiz' },
        loadComponent: () => import('./features/study/study-session').then((m) => m.StudySession),
      },
      {
        path: 'study/practice',
        title: 'titles.practice',
        data: { mode: 'practice' },
        loadComponent: () => import('./features/study/study-session').then((m) => m.StudySession),
      },
      {
        path: 'decks/new',
        title: 'titles.newDeck',
        loadComponent: () => import('./features/decks/deck-form/deck-form').then((m) => m.DeckForm),
      },
      {
        path: 'decks/:deckId',
        title: 'titles.deck',
        loadComponent: () => import('./features/decks/deck-page/deck-page').then((m) => m.DeckPage),
      },
      {
        path: 'decks/:deckId/edit',
        title: 'titles.editDeck',
        loadComponent: () => import('./features/decks/deck-form/deck-form').then((m) => m.DeckForm),
      },
      {
        path: 'decks/:deckId/cards/new',
        title: 'titles.newCard',
        loadComponent: () =>
          import('./features/decks/card-editor/card-editor').then((m) => m.CardEditor),
      },
      {
        path: 'decks/:deckId/cards/:cardId',
        title: 'titles.editCard',
        loadComponent: () =>
          import('./features/decks/card-editor/card-editor').then((m) => m.CardEditor),
      },
      {
        path: 'explore/:deckId',
        title: 'titles.publicDeck',
        loadComponent: () =>
          import('./features/explore/public-deck/public-deck').then((m) => m.PublicDeckPage),
      },
      {
        path: 'explore/:deckId/test',
        title: 'titles.test',
        data: { mode: 'test' },
        loadComponent: () => import('./features/study/study-session').then((m) => m.StudySession),
      },
      {
        path: 'explore/:deckId/report',
        title: 'titles.report',
        loadComponent: () =>
          import('./features/explore/report-form/report-form').then((m) => m.ReportForm),
      },
      {
        path: 'publish',
        title: 'titles.publish',
        loadComponent: () =>
          import('./features/explore/publish-form/publish-form').then((m) => m.PublishForm),
      },
      // Deleting the account happens on the Synapse account page.
      { path: 'settings/delete-account', redirectTo: 'settings' },
    ],
  },
  { path: '**', redirectTo: '' },
];
