/**
 * The seam between an {@link HttpError} and the JSON a client receives.
 *
 * awpaki's default body is `{ message }` (plus `data`), which is one convention among
 * several. A service whose API contract is a stable machine-readable code —
 * `{ "error": "not_found" }`, with translation done by the client — had no way to produce it:
 * the body was built inline inside the response methods, so the only escape was to stop using
 * the error family altogether.
 *
 * A shaper is registered once, at bootstrap, and every error path honours it: both API
 * Gateway payload formats, the handlers in `errors/handlers`, and the factory `catch` blocks.
 * The registry mirrors {@link setLogger} and {@link setHandlerLogCollector} — resolution is
 * **late**, per response, because handlers are built at module scope, before a consumer's
 * bootstrap has run.
 *
 * @module errors/http/errorBody
 */

import { getLogger } from '../../loggers/logger.js';
import type { HttpError } from './HttpError.js';

/** Which response builder is asking for a body. */
export type ErrorBodyTarget = 'apiGateway' | 'apiGatewayV2';

/**
 * Everything a shaper gets besides the error itself.
 */
export interface ErrorBodyContext {
  /** Response format being built, for shapers that answer differently per integration. */
  target: ErrorBodyTarget;
  /**
   * The body awpaki would have sent.
   *
   * Non-optional on purpose: a shaper that returns a fresh object silently drops whatever the
   * default body carried — `data.errors` from the schema extractor above all, which is the
   * per-field map a form needs. Spreading it is how a shaper adds a field instead of
   * replacing the payload.
   */
  defaultBody: Record<string, unknown>;
}

/**
 * Turns an error into the value serialized as the response body. Returning a string means
 * "already serialized" and is passed through untouched, matching how the handler factories
 * treat a string `body`.
 */
export type ErrorBodyShaper = (error: HttpError, context: ErrorBodyContext) => unknown;

let shaper: ErrorBodyShaper | undefined;

/**
 * Replaces the body every {@link HttpError} produces.
 *
 * @param fn - Shaper invoked for each error response
 * @returns Nothing
 * @throws TypeError if the value is not a function
 *
 * @example
 * ```typescript
 * import { setErrorBodyShaper } from 'awpaki/errors';
 *
 * // `{ "error": "not_found" }` and nothing else
 * setErrorBodyShaper((error) => ({ error: error.code }));
 * ```
 */
export function setErrorBodyShaper(fn: ErrorBodyShaper): void {
  if (typeof fn !== 'function') {
    throw new TypeError('setErrorBodyShaper expects a function');
  }
  shaper = fn;
}

/**
 * Returns the registered shaper, or undefined when the default body is in use.
 *
 * @returns The active shaper, if any
 */
export function getErrorBodyShaper(): ErrorBodyShaper | undefined {
  return shaper;
}

/**
 * Restores the built-in `{ message }` body. Mainly useful in tests.
 *
 * @returns Nothing
 *
 * @example
 * ```typescript
 * afterEach(() => resetErrorBodyShaper());
 * ```
 */
export function resetErrorBodyShaper(): void {
  shaper = undefined;
}

/**
 * Ready-made shaper for the `{ error: code }` contract.
 *
 * `message` stays out of the payload by design: it is prose written for whoever reads the
 * log, in one language, and a client that branches on it is branching on a string the library
 * is free to reword. `data` is carried over when present, because a per-field validation map
 * is part of the answer rather than diagnostics.
 *
 * @param error - Error being serialized
 * @returns `{ error, data? }`
 *
 * @example
 * ```typescript
 * setErrorBodyShaper(codeErrorBodyShaper);
 * // 404 → { "error": "not_found" }
 * // schema failure → { "error": "unprocessable_entity", "data": { "errors": { ... } } }
 * ```
 */
export function codeErrorBodyShaper(error: HttpError): unknown {
  return error.data === undefined ? { error: error.code } : { error: error.code, data: error.data };
}

/**
 * Serializes the body for one error response.
 *
 * @param error - Error being answered
 * @param context - Target format and the default body
 * @param override - Shaper for this call only, taking precedence over the registered one
 * @returns The serialized JSON body
 */
export function serializeErrorBody(
  error: HttpError,
  context: ErrorBodyContext,
  override?: ErrorBodyShaper
): string {
  const active = override ?? shaper;

  if (!active) {
    return JSON.stringify(context.defaultBody) ?? '';
  }

  // A shaper is consumer code running in the last `catch` of the invocation. If it throws, or
  // returns something `JSON.stringify` refuses (a circular object, a BigInt), the original
  // error would be replaced by an unhandled 5xx and lost. Degrading to the built-in body
  // keeps the status and the message the caller was owed.
  try {
    const shaped = active(error, context);
    return typeof shaped === 'string' ? shaped : (JSON.stringify(shaped) ?? '');
  } catch (shaperError) {
    getLogger().warn(
      { err: shaperError, code: error.code, statusCode: error.statusCode },
      'awpaki error body shaper failed, falling back to the default body'
    );
    return JSON.stringify(context.defaultBody) ?? '';
  }
}
