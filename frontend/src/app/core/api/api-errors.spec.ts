import { HttpErrorResponse } from '@angular/common/http';
import { httpStatus, problemFields } from './api-errors';

describe('api errors', () => {
  it('should read the status of an HTTP error, 0 when unreachable', () => {
    expect(httpStatus(new HttpErrorResponse({ status: 409 }))).toBe(409);
    expect(httpStatus(new HttpErrorResponse({ status: 0 }))).toBe(0);
  });

  it('should have no status for anything that is not an HTTP error', () => {
    expect(httpStatus(new Error('boom'))).toBeNull();
    expect(httpStatus(undefined)).toBeNull();
  });

  it('should list the fields of a validation problem', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { title: 'Conflict', errors: { username: ['taken'], email: ['taken'] } },
    });

    expect(problemFields(error)).toEqual(['username', 'email']);
  });

  it.each([
    [
      'a problem without errors',
      new HttpErrorResponse({ status: 401, error: { title: 'Unauthorized' } }),
    ],
    ['a plain text body', new HttpErrorResponse({ status: 500, error: 'Server error' })],
    [
      'errors that are not an object',
      new HttpErrorResponse({ status: 400, error: { errors: ['x'] } }),
    ],
    ['something that is not an HTTP error', new Error('boom')],
  ])('should list no fields for %s', (_, error) => {
    expect(problemFields(error)).toEqual([]);
  });
});
