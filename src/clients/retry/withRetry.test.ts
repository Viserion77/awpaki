import { getLogger, resetLogger, setLogger } from '../../loggers/logger.js';
import type { Logger } from '../../loggers/logger.js';
import { withRetry } from './withRetry.js';

/**
 * Builds an error shaped like one the AWS SDK throws.
 *
 * @param name - Error name, which is where the SDK puts the service error code
 * @param extra - Extra fields
 * @returns The error
 */
function awsError(name: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`${name} happened`), { name }, extra);
}

const fastRetry = { minTimeout: 1, maxTimeout: 2 };

describe('withRetry', () => {
  afterEach(() => {
    resetLogger();
  });

  it('returns the first successful result without retrying', async () => {
    const send = jest.fn().mockResolvedValue('ok');

    await expect(withRetry({ service: 'dynamodb' }, send)).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure and returns the eventual success', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(awsError('ThrottlingException'))
      .mockResolvedValue('ok');

    await expect(withRetry({ service: 'dynamodb' }, send, fastRetry)).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(2);
  });

  // The behaviour the whole change exists for: a deterministic answer must reach the caller
  // in milliseconds, not after four attempts and several seconds of backoff.
  it('gives up immediately on a deterministic failure', async () => {
    const send = jest.fn().mockRejectedValue(awsError('ConditionalCheckFailedException'));

    await expect(withRetry({ service: 'dynamodb' }, send, fastRetry)).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stops after the configured number of retries and rethrows the last error', async () => {
    const send = jest.fn().mockRejectedValue(awsError('ThrottlingException'));

    await expect(
      withRetry({ service: 'dynamodb' }, send, { ...fastRetry, retries: 2 })
    ).rejects.toMatchObject({ name: 'ThrottlingException' });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('does not retry at all with retries: 0', async () => {
    const send = jest.fn().mockRejectedValue(awsError('ThrottlingException'));

    await expect(withRetry({ service: 'sqs' }, send, { retries: 0 })).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('accepts a caller-supplied classifier', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('weird')).mockResolvedValue('ok');

    await expect(
      withRetry({ service: 's3' }, send, { ...fastRetry, shouldRetry: () => true })
    ).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops once maxElapsedMs has passed, without waiting again', async () => {
    const send = jest.fn().mockRejectedValue(awsError('ThrottlingException'));

    await expect(
      withRetry({ service: 's3' }, send, { ...fastRetry, maxElapsedMs: 0 })
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying while there is budget left', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(awsError('ThrottlingException'))
      .mockResolvedValue('ok');

    await expect(
      withRetry({ service: 's3' }, send, { ...fastRetry, maxElapsedMs: 60_000 })
    ).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops when the signal is aborted', async () => {
    const signal = { aborted: false };
    const send = jest.fn().mockImplementation(() => {
      signal.aborted = true;
      return Promise.reject(awsError('ThrottlingException'));
    });

    await expect(withRetry({ service: 's3' }, send, { ...fastRetry, signal })).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  describe('backoff', () => {
    it('waits a random slice of the capped delay under full jitter', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const send = jest
        .fn()
        .mockRejectedValueOnce(awsError('ThrottlingException'))
        .mockResolvedValue('ok');

      const startedAt = Date.now();
      await withRetry({ service: 'dynamodb' }, send, { minTimeout: 40, maxTimeout: 100 });

      // 40ms base, halved by the stubbed jitter.
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
      randomSpy.mockRestore();
    });

    it('waits the full delay under legacy jitter', async () => {
      const send = jest
        .fn()
        .mockRejectedValueOnce(awsError('ThrottlingException'))
        .mockResolvedValue('ok');

      const startedAt = Date.now();
      await withRetry({ service: 'dynamodb' }, send, {
        minTimeout: 30,
        maxTimeout: 30,
        jitter: 'legacy',
      });

      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
    });
  });

  describe('logging', () => {
    it('warns once per retry with the fields an operator needs', async () => {
      const warn = jest.fn();
      setLogger({ info: jest.fn(), debug: jest.fn(), warn, error: jest.fn() } as Logger);

      const send = jest
        .fn()
        .mockRejectedValueOnce(
          awsError('ThrottlingException', { $metadata: { httpStatusCode: 400 } })
        )
        .mockResolvedValue('ok');

      await withRetry({ service: 'dynamodb', command: 'PutCommand' }, send, fastRetry);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'dynamodb',
          command: 'PutCommand',
          attempt: 1,
          errorName: 'ThrottlingException',
          statusCode: 400,
        }),
        expect.stringContaining('Retrying dynamodb')
      );
    });

    // `ConditionalCheckFailedException` carries the item that failed the condition, and
    // `TransactionCanceledException` one per reason: customer rows, in a warning that fires
    // on every throttle.
    it('never logs the error object itself', async () => {
      const warn = jest.fn();
      setLogger({ info: jest.fn(), debug: jest.fn(), warn, error: jest.fn() } as Logger);

      const send = jest
        .fn()
        .mockRejectedValueOnce(awsError('ThrottlingException', { Item: { ssn: '000-00-0000' } }))
        .mockResolvedValue('ok');

      await withRetry({ service: 'dynamodb' }, send, fastRetry);

      expect(JSON.stringify(warn.mock.calls)).not.toContain('000-00-0000');
    });

    it('says nothing when the call succeeds first time', async () => {
      const warn = jest.fn();
      setLogger({ info: jest.fn(), debug: jest.fn(), warn, error: jest.fn() } as Logger);

      await withRetry({ service: 's3' }, jest.fn().mockResolvedValue('ok'));

      expect(warn).not.toHaveBeenCalled();
      expect(getLogger().warn).toBe(warn);
    });
  });
});
