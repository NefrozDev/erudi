import { HttpErrorResponse } from '@angular/common/http';

/** The HTTP status of a failed call, or 0 when the API could not be reached. */
export function httpStatus(error: unknown): number | null {
  return error instanceof HttpErrorResponse ? error.status : null;
}

/** The fields named in a validation problem (`errors` of RFC 9457 problem details). */
export function problemFields(error: unknown): string[] {
  if (!(error instanceof HttpErrorResponse) || !isRecord(error.error)) {
    return [];
  }

  const errors = error.error['errors'];
  return isRecord(errors) ? Object.keys(errors) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
