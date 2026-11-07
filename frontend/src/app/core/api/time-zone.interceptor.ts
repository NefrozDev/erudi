import { HttpInterceptorFn } from '@angular/common/http';

/** Read by the API (backend `Study/StudyCalendar.cs`). */
export const TIME_ZONE_HEADER = 'X-Time-Zone';

/**
 * Sends the device's time zone with every API call. Cards are due on calendar days, and the
 * learner's "today" depends on where they are. Other hosts never receive it.
 */
export const timeZoneInterceptor: HttpInterceptorFn = (request, next) => {
  const timeZone = deviceTimeZone();
  if (!request.url.startsWith('/api/') || !timeZone) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { [TIME_ZONE_HEADER]: timeZone } }));
};

/** An IANA id such as "Europe/Brussels"; the API falls back to Brussels without it. */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
