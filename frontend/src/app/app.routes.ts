import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth/auth-guards';

export const routes: Routes = [
  {
    path: 'welcome',
    title: 'titles.welcome',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/onboarding/intro').then((m) => m.Intro),
  },
  {
    path: 'sign-up',
    title: 'titles.signUp',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/auth/sign-up/sign-up').then((m) => m.SignUp),
  },
  {
    path: 'sign-in',
    title: 'titles.signIn',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/auth/sign-in/sign-in').then((m) => m.SignIn),
  },
  {
    path: 'forgot-password',
    title: 'titles.forgotPassword',
    canActivate: [signedOutGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    // Open whether signed in or not: the e-mailed link must work on any device.
    path: 'reset-password',
    title: 'titles.resetPassword',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
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
              import('./features/coming-soon/coming-soon').then((m) => m.ComingSoon),
          },
          {
            path: 'progress',
            title: 'titles.progress',
            loadComponent: () =>
              import('./features/coming-soon/coming-soon').then((m) => m.ComingSoon),
          },
          {
            path: 'settings',
            title: 'titles.settings',
            loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
          },
        ],
      },
      // Full-screen pages, without the bottom bar (screens 8 and 9).
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
    ],
  },
  { path: '**', redirectTo: '' },
];
