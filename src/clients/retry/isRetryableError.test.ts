import { isRetryableError } from './isRetryableError.js';

/**
 * Builds an error shaped like one the AWS SDK throws.
 *
 * @param name - Error name, which is where the SDK puts the service error code
 * @param extra - Extra fields ($metadata, $retryable, CancellationReasons, ...)
 * @returns The error
 */
function awsError(name: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`${name} happened`), { name }, extra);
}

describe('isRetryableError', () => {
  describe('deterministic answers are never retried', () => {
    // The one that started this: a failed condition IS the answer of a conditional write.
    // Retrying it cost four attempts and several seconds before the caller heard a 409 —
    // long enough to exhaust an API Gateway budget and answer 504 instead.
    it('refuses ConditionalCheckFailedException', () => {
      expect(isRetryableError(awsError('ConditionalCheckFailedException'))).toBe(false);
    });

    it('refuses it even when the SDK decorates it as retryable', () => {
      expect(
        isRetryableError(
          awsError('ConditionalCheckFailedException', {
            $retryable: { throttling: false },
            $metadata: { httpStatusCode: 500 },
          })
        )
      ).toBe(false);
    });

    it.each([
      'ValidationException',
      'AccessDeniedException',
      'ResourceNotFoundException',
      'InvalidParameterException',
      'IdempotentParameterMismatchException',
      'SignatureDoesNotMatch',
    ])('refuses %s', (name) => {
      expect(isRetryableError(awsError(name))).toBe(false);
    });
  });

  describe('throttling', () => {
    // DynamoDB answers HTTP 400 for these. A "never retry a 4xx" rule placed before the name
    // list would disable retries for the service that needs them most.
    it.each([
      'ThrottlingException',
      'ProvisionedThroughputExceededException',
      'RequestLimitExceeded',
      'TransactionInProgressException',
      'TooManyRequestsException',
      'SlowDown',
    ])('retries %s even with a 400 status', (name) => {
      expect(isRetryableError(awsError(name, { $metadata: { httpStatusCode: 400 } }))).toBe(true);
    });

    it('retries an HTTP 429', () => {
      expect(isRetryableError(awsError('Whatever', { $metadata: { httpStatusCode: 429 } }))).toBe(
        true
      );
    });
  });

  describe('the $retryable trait', () => {
    // AWS's own rule is presence, not truthiness: DynamoDB ships
    // `ReplicatedWriteConflictException` with an empty `$retryable` object.
    it('retries on the presence of the trait, even when it is empty', () => {
      expect(
        isRetryableError(awsError('ReplicatedWriteConflictException', { $retryable: {} }))
      ).toBe(true);
    });
  });

  describe('transactions', () => {
    it('retries a cancellation caused by a transaction conflict', () => {
      expect(
        isRetryableError(
          awsError('TransactionCanceledException', {
            $metadata: { httpStatusCode: 400 },
            CancellationReasons: [{ Code: 'None' }, { Code: 'TransactionConflict' }],
          })
        )
      ).toBe(true);
    });

    it('refuses one caused by a failed condition, which will fail again', () => {
      expect(
        isRetryableError(
          awsError('TransactionCanceledException', {
            CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
          })
        )
      ).toBe(false);
    });

    it('refuses one with no reasons at all', () => {
      expect(isRetryableError(awsError('TransactionCanceledException'))).toBe(false);
    });

    it('refuses one whose reasons are all None', () => {
      expect(
        isRetryableError(
          awsError('TransactionCanceledException', {
            CancellationReasons: [{ Code: 'None' }, { Code: 'None' }],
          })
        )
      ).toBe(false);
    });
  });

  describe('transport and server failures', () => {
    it.each(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'])(
      'retries a %s transport failure',
      (code) => {
        expect(isRetryableError(Object.assign(new Error('socket hang up'), { code }))).toBe(true);
      }
    );

    it('retries a 5xx', () => {
      expect(
        isRetryableError(awsError('InternalError', { $metadata: { httpStatusCode: 500 } }))
      ).toBe(true);
      expect(isRetryableError(awsError('Unknown', { $metadata: { httpStatusCode: 503 } }))).toBe(
        true
      );
    });

    it('refuses an unrecognised 4xx', () => {
      expect(
        isRetryableError(awsError('SomethingElse', { $metadata: { httpStatusCode: 404 } }))
      ).toBe(false);
    });
  });

  describe('values that are not errors', () => {
    it.each([null, undefined, 'boom', 42])('refuses %p', (value) => {
      expect(isRetryableError(value)).toBe(false);
    });

    // No status and no recognised name: re-running it could repeat a non-idempotent write for
    // a failure that was never transient.
    it('refuses a bare Error', () => {
      expect(isRetryableError(new Error('boom'))).toBe(false);
    });

    it('does not read the message, which is prose', () => {
      expect(isRetryableError(new Error('ThrottlingException'))).toBe(false);
    });
  });
});
