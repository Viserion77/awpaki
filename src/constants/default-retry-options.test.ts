import type { RetryOptions } from '../clients/index.types';
import { defaultRetryOptions } from './default-retry-options';

describe('defaultRetryOptions', () => {
  it('exposes the retry defaults used by every client', () => {
    expect(defaultRetryOptions).toEqual({
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 3000,
    });
  });

  it('does not carry unexpected keys', () => {
    expect(Object.keys(defaultRetryOptions).sort()).toEqual([
      'maxTimeout',
      'minTimeout',
      'retries',
    ]);
  });

  it('is assignable to RetryOptions', () => {
    const typed: RetryOptions = defaultRetryOptions;

    expect(typed.retries).toBe(3);
    expect(typed.minTimeout).toBe(1000);
    expect(typed.maxTimeout).toBe(3000);
  });

  it('keeps the untouched defaults when merged with a partial override', () => {
    const options = { ...defaultRetryOptions, ...{ retries: 5 } };

    expect(options).toEqual({ retries: 5, minTimeout: 1000, maxTimeout: 3000 });
  });

  it('keeps the defaults when no option is provided', () => {
    // Mirrors what every client does: `{ ...defaultRetryOptions, ...retryOptions }`
    const merge = (retryOptions?: RetryOptions) => ({ ...defaultRetryOptions, ...retryOptions });

    expect(merge()).toEqual(defaultRetryOptions);
    expect(merge({})).toEqual(defaultRetryOptions);
  });

  it('is not mutated by the merge performed by the clients', () => {
    const snapshot = { ...defaultRetryOptions };

    const merged = { ...defaultRetryOptions, retries: 42, minTimeout: 1, maxTimeout: 2 };

    expect(merged.retries).toBe(42);
    expect(defaultRetryOptions).toEqual(snapshot);
  });

  it('is the same object on every import (single shared source)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reimported = require('./default-retry-options').defaultRetryOptions;

    expect(reimported).toBe(defaultRetryOptions);
  });
});
