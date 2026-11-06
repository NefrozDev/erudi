import { HttpErrorResponse, HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth-store';

/**
 * A 401 from any API call but the auth ones means the session ended on the server: forget
 * the user and go to the sign-in screen. Auth calls answer 401 for wrong credentials, which
 * their screens explain themselves.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === HttpStatusCode.Unauthorized &&
        !request.url.startsWith('/api/auth/') &&
        auth.signedIn()
      ) {
        auth.clear();
        void router.navigateByUrl('/sign-in');
      }

      return throwError(() => error);
    }),
  );
};
