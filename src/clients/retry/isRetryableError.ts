/**
 * Decides which AWS failures are worth trying again.
 *
 * The clients used to retry **everything** three times with a 1–3 s backoff. That turned
 * `ConditionalCheckFailedException` — the mechanism a conditional write uses to say "someone
 * else got there first", which is the answer, not a failure — into four attempts and several
 * seconds of sleep before the caller heard it, long enough to blow an API Gateway budget and
 * return a 504 in place of a 409. `ValidationException`, `AccessDenied` and every other
 * deterministic 4xx paid the same toll for an answer that could not change.
 *
 * The order of the checks below is load-bearing, and it is where the obvious policy
 * ("retry throttling and 5xx, never 4xx") goes wrong: DynamoDB answers **HTTP 400** for
 * `ProvisionedThroughputExceededException`, `ThrottlingException`, `RequestLimitExceeded` and
 * `TransactionInProgressException`. Put the 4xx rule before the throttling names and retries
 * are disabled for the service that needs them most.
 *
 * @module clients/retry/isRetryableError
 */

/**
 * Errors that must never be retried, whatever else they look like.
 *
 * Every one of them is a deterministic answer about the request: retrying re-asks a question
 * that has already been answered, and in the conditional-write case hides the answer behind
 * a timeout.
 */
const NEVER_RETRY_NAMES: ReadonlySet<string> = new Set([
  'ConditionalCheckFailedException',
  'ValidationException',
  'ValidationError',
  'IdempotentParameterMismatchException',
  'InvalidParameterException',
  'InvalidParameterValueException',
  'InvalidRequestException',
  'InvalidSignatureException',
  'MissingParameter',
  'MissingRequiredParameter',
  'AccessDenied',
  'AccessDeniedException',
  'UnrecognizedClientException',
  'IncompleteSignature',
  'InvalidClientTokenId',
  'AuthFailure',
  'SignatureDoesNotMatch',
  'ResourceNotFoundException',
  'NoSuchKey',
  'NoSuchBucket',
  'NotFound',
  'EntityAlreadyExists',
  'ResourceInUseException',
  'ConditionalRequestConflict',
]);

/**
 * Throttling and capacity errors. Several of these arrive with an HTTP 400, which is why the
 * name list is consulted before any status-code rule.
 */
const THROTTLING_NAMES: ReadonlySet<string> = new Set([
  'ThrottlingException',
  'Throttling',
  'ThrottledException',
  'RequestThrottled',
  'RequestThrottledException',
  'ProvisionedThroughputExceededException',
  'RequestLimitExceeded',
  'TooManyRequestsException',
  'TransactionInProgressException',
  'BandwidthLimitExceeded',
  'LimitExceededException',
  'SlowDown',
  'EC2ThrottledException',
  'PriorRequestNotComplete',
]);

/** Transient server-side failures that are safe to re-ask. */
const TRANSIENT_NAMES: ReadonlySet<string> = new Set([
  'InternalError',
  'InternalFailure',
  'InternalServerError',
  'InternalServerErrorException',
  'ServiceUnavailable',
  'ServiceUnavailableException',
  'RequestTimeout',
  'RequestTimeoutException',
  'RequestTimeTooSkewed',
  'IDPCommunicationError',
  'ItemCollectionSizeLimitExceededException',
]);

/** Node transport failures, which never reached the service at all. */
const TRANSPORT_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EBUSY',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
  'TimeoutError',
]);

/**
 * Cancellation reasons that a transaction can be retried through. `None` marks the items that
 * were fine, so it is accepted but does not, on its own, make the transaction retryable.
 */
const RETRYABLE_CANCELLATION_CODES: ReadonlySet<string> = new Set([
  'None',
  'TransactionConflict',
  'ThrottlingError',
  'ProvisionedThroughputExceeded',
]);

/** Shape of the fields this module reads off a thrown value. */
interface AwsErrorLike {
  name?: unknown;
  code?: unknown;
  errno?: unknown;
  message?: unknown;
  $retryable?: { throttling?: boolean } | undefined;
  $metadata?: { httpStatusCode?: number } | undefined;
  CancellationReasons?: Array<{ Code?: unknown }> | undefined;
}

/**
 * Reads a string field off an unknown thrown value.
 *
 * @param error - Value caught from the SDK
 * @param key - Field to read
 * @returns The value when it is a string, otherwise undefined
 */
function stringField(error: AwsErrorLike, key: 'name' | 'code' | 'errno' | 'message'): string {
  const value = error[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Classifies a `TransactionCanceledException`, whose retryability lives in its reasons.
 *
 * A blanket "never retry a 4xx" gets this wrong: `TransactionConflict` is the one case AWS
 * explicitly tells you to retry, and it arrives inside a 400.
 *
 * @param error - The cancellation error
 * @returns True when every reason is retryable and at least one item actually failed
 */
function isRetryableTransactionCancellation(error: AwsErrorLike): boolean {
  const reasons = Array.isArray(error.CancellationReasons) ? error.CancellationReasons : [];

  if (reasons.length === 0) return false;

  const codes = reasons.map((reason) => (typeof reason?.Code === 'string' ? reason.Code : ''));

  return (
    codes.every((code) => RETRYABLE_CANCELLATION_CODES.has(code)) &&
    codes.some((code) => code !== 'None' && code !== '')
  );
}

/**
 * Decides whether a failed AWS call should be tried again.
 *
 * @param error - Value thrown by the SDK
 * @returns True when another attempt could plausibly succeed
 *
 * @example
 * ```typescript
 * isRetryableError(new Error('ThrottlingException')); // depends on `name`, not the message
 * isRetryableError({ name: 'ConditionalCheckFailedException' }); // false — that is the answer
 * ```
 */
export function isRetryableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as AwsErrorLike;
  const name = stringField(candidate, 'name');
  const code = stringField(candidate, 'code');

  // First, and above everything: a deterministic answer stays an answer even when the SDK
  // decorates it with `$retryable` or a 5xx-looking status.
  if (NEVER_RETRY_NAMES.has(name) || NEVER_RETRY_NAMES.has(code)) return false;

  if (name === 'TransactionCanceledException' || code === 'TransactionCanceledException') {
    return isRetryableTransactionCancellation(candidate);
  }

  const status = candidate.$metadata?.httpStatusCode;

  if (THROTTLING_NAMES.has(name) || THROTTLING_NAMES.has(code) || status === 429) return true;

  // The SDK's own rule is presence, not truthiness: DynamoDB ships
  // `ReplicatedWriteConflictException` with an empty `$retryable` object.
  if (candidate.$retryable !== undefined && candidate.$retryable !== null) return true;

  const errno = stringField(candidate, 'errno');
  if (TRANSPORT_CODES.has(code) || TRANSPORT_CODES.has(name) || TRANSPORT_CODES.has(errno)) {
    return true;
  }

  if (TRANSIENT_NAMES.has(name) || TRANSIENT_NAMES.has(code)) return true;

  if (typeof status === 'number') {
    // Only now, once every name-based rule has had its say, does the status decide.
    return status >= 500;
  }

  // No status and no recognised name: the call may never have left the process, but there is
  // nothing here to distinguish a network blip from a programming error, and re-running an
  // unknown failure risks repeating a non-idempotent write.
  return false;
}
