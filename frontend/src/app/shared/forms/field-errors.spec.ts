import { visibleError } from './field-errors';

describe('visibleError', () => {
  const field = (touched: boolean, messages: (string | undefined)[]) => () => ({
    touched: () => touched,
    errors: () => messages.map((message) => ({ message })),
  });

  it('should hide errors until the field is touched', () => {
    expect(visibleError(field(false, ['auth.errors.required']))).toBeNull();
  });

  it('should show the first error of a touched field', () => {
    expect(visibleError(field(true, ['auth.errors.required', 'auth.errors.email']))).toBe(
      'auth.errors.required',
    );
  });

  it('should show nothing for a valid field or an error without message', () => {
    expect(visibleError(field(true, []))).toBeNull();
    expect(visibleError(field(true, [undefined]))).toBeNull();
  });
});
