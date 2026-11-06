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
    pathMatch: 'full',
    title: 'titles.home',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  { path: '**', redirectTo: '' },
];
