// `aws-lambda` is an optional peer dependency and this import is types only:
// `import type` guarantees it is erased at compile time, so the emitted JavaScript
// never requires the package — even under `isolatedModules`/`verbatimModuleSyntax`
// or with a bundler that does not elide unused value imports.
import type { APIGatewayProxyResult, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { serializeErrorBody } from './errorBody.js';
import type { ErrorBodyShaper } from './errorBody.js';
import { getDefaultErrorCode } from './HttpStatus.js';
import { shouldIncludeInfraMetadata } from './infraMetadata.js';

/**
 * Fields accepted by every {@link HttpError} constructor in addition to the positional
 * `message`/`data`/`headers`, whether the error is built positionally or from an init object.
 */
export interface HttpErrorOptions {
  /**
   * Stable machine-readable code for this failure, e.g. `user_not_found`.
   *
   * Defaults to the conventional code for the status ({@link getDefaultErrorCode}). It is
   * what a client should branch on — unlike `message`, which is prose meant for a human
   * reading a log — and it is deliberately **absent from the default response body**: the
   * built-in body stays `{ message }` for compatibility, and putting the code on the wire is
   * one line through {@link setErrorBodyShaper}.
   */
  code?: string;
  /** Underlying error, kept for the log. Never serialized into a response. */
  cause?: unknown;
  /**
   * Detail that helps whoever debugs this and must never reach the caller: downstream stack
   * traces, raw payloads, internal hostnames. Stored non-enumerably, excluded from every
   * response builder, and copied into the log record by `toErrorLog`.
   */
  diagnostics?: Record<string, unknown>;
}

/**
 * Init object accepted by the {@link HttpError} subclasses, which already know their status.
 */
export interface HttpErrorInit extends HttpErrorOptions {
  /** Human-readable message, for logs. Defaults to the subclass's own default. */
  message?: string;
  /** Structured detail serialized into the response body under `data`. */
  data?: Record<string, any>;
  /** Headers merged into the response. */
  headers?: Record<string, string | boolean | number>;
}

/**
 * Init object accepted by {@link HttpError} itself, which needs the status too.
 */
export interface HttpErrorInitWithStatus extends HttpErrorInit {
  /** HTTP status code of the response this error becomes. */
  statusCode: number;
}

/**
 * Normalizes the two constructor shapes into a single init object.
 *
 * Every subclass takes both `new NotFound('User 42 is gone')` and
 * `new NotFound({ code: 'user_not_found', message: 'User 42 is gone' })`, so each one needs
 * the same six-line normalization; keeping it here means the subclasses stay two overloads
 * and one `super()` call, and the precedence rule (init wins, positional fills the gaps) is
 * written once.
 *
 * @param messageOrInit - First constructor argument: a message or an init object
 * @param fallback - Status the subclass is fixed to, and the message it defaults to
 * @param data - Positional `data`, ignored when an init object was passed
 * @param headers - Positional `headers`, ignored when an init object was passed
 * @param options - Positional options, ignored when an init object was passed
 * @returns The init object to hand to `super()`
 */
export function toHttpErrorInit(
  messageOrInit: string | HttpErrorInit | undefined,
  fallback: { statusCode: number; message?: string },
  data?: Record<string, any>,
  headers?: Record<string, string | boolean | number>,
  options?: HttpErrorOptions
): HttpErrorInitWithStatus {
  if (typeof messageOrInit === 'object') {
    return {
      ...messageOrInit,
      message: messageOrInit.message ?? fallback.message,
      statusCode: fallback.statusCode,
    };
  }

  return {
    ...options,
    message: messageOrInit ?? fallback.message,
    statusCode: fallback.statusCode,
    data,
    headers,
  };
}

/**
 * Base class for HTTP errors with AWS Lambda integration
 *
 * @example
 * ```typescript
 * throw new HttpError('Something went wrong', 500);
 * ```
 *
 * @example
 * ```typescript
 * // Init form: a stable code for the client, prose for the log, detail for neither
 * throw new HttpError({
 *   statusCode: 502,
 *   code: 'billing_unavailable',
 *   message: 'billing-service returned 500',
 *   diagnostics: { upstreamTrace },
 * });
 * ```
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly data?: Record<string, any>;
  public readonly headers?: Record<string, string | boolean | number>;
  // Definite assignment: the constructor installs these through `Object.defineProperty`
  // (see below), which TypeScript cannot see as an initialization.
  private readonly lambdaMetadata!: {
    logStreamName?: string;
    executionEnv?: string;
    functionName?: string;
  };
  public readonly diagnostics!: Record<string, unknown> | undefined;

  constructor(
    message: string,
    statusCode: number,
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>,
    options?: HttpErrorOptions
  );
  constructor(init: HttpErrorInitWithStatus);
  constructor(
    messageOrInit: string | HttpErrorInitWithStatus,
    statusCode?: number,
    data?: Record<string, any>,
    headers?: Record<string, string | boolean | number>,
    options?: HttpErrorOptions
  ) {
    // The base class is the one case the helper cannot serve: its init object carries the
    // status itself, so there is no subclass-fixed fallback to merge over.
    const init: HttpErrorInitWithStatus =
      typeof messageOrInit === 'object'
        ? messageOrInit
        : toHttpErrorInit(
            messageOrInit,
            { statusCode: statusCode as number },
            data,
            headers,
            options
          );

    super(init.message ?? '');
    this.name = this.constructor.name;
    this.statusCode = init.statusCode;
    this.code = init.code ?? getDefaultErrorCode(init.statusCode);
    this.data = init.data;
    this.headers = init.headers;

    if (init.cause !== undefined) {
      // `cause` is own-but-non-enumerable when V8 sets it, and the log serializer copies it
      // explicitly for that reason. Matching those attributes keeps a hand-set cause out of
      // response bodies and out of every generic `Object.keys` walk, exactly like a native one.
      Object.defineProperty(this, 'cause', {
        value: init.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }

    // Capture Lambda environment metadata.
    // `private` is erased at runtime, so a plain assignment leaves an own *enumerable*
    // property that every structured serializer picks up — the error loggers would copy
    // this whole object into each log line. Defined non-enumerable so it stays an
    // implementation detail; reads through `this.lambdaMetadata` are unaffected.
    Object.defineProperty(this, 'lambdaMetadata', {
      value: {
        logStreamName: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
        executionEnv: process.env.AWS_EXECUTION_ENV,
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      },
      enumerable: false,
      writable: false,
      configurable: true,
    });

    // Same treatment, for the opposite reason: `diagnostics` exists to be logged and never
    // sent. Enumerable, it would be copied into `data`-like walks and into any consumer that
    // spreads the error, which is precisely the leak it is meant to prevent.
    Object.defineProperty(this, 'diagnostics', {
      value: init.diagnostics,
      enumerable: false,
      writable: false,
      configurable: true,
    });

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a string representation of the error for logging
   * @returns {string}
   */
  public toString(): string {
    return `${this.name}: ${this.message}${this.stack ? `\n${this.stack}` : ''}`;
  }

  /**
   * Builds the body awpaki sends when no {@link ErrorBodyShaper} is installed.
   *
   * One implementation for both API Gateway payload formats: they differ in the envelope
   * around the body, never in the body itself, and the two copies this replaces had already
   * drifted into being edited in pairs.
   *
   * @returns The default response body, as an object
   */
  private buildDefaultBody(): Record<string, unknown> {
    const responseBody: Record<string, unknown> = { message: this.message };

    if (this.data) {
      responseBody.data = this.data;
    }

    if (shouldIncludeInfraMetadata(this.statusCode)) {
      const { logStreamName, executionEnv, functionName } = this.lambdaMetadata;

      if (logStreamName || executionEnv || functionName) {
        responseBody['$x-custom-metadata'] = {
          ...(logStreamName && { logStreamName }),
          ...(executionEnv && { executionEnv }),
          ...(functionName && { functionName }),
        };
      }
    }

    return responseBody;
  }

  /**
   * Returns an AWS API Gateway response object
   * Useful for returning errors in API Gateway Lambda functions
   *
   * @param additionalHeaders - Optional additional headers to include
   * @param shaper - Overrides the shaper registered with {@link setErrorBodyShaper}
   * @returns API Gateway response format
   *
   * @example
   * ```typescript
   * try {
   *   // your code
   * } catch (error) {
   *   if (error instanceof HttpError) {
   *     return error.toApiGatewayResponse();
   *   }
   *   throw error;
   * }
   * ```
   */
  public toApiGatewayResponse(
    additionalHeaders?: Record<string, string | boolean | number>,
    shaper?: ErrorBodyShaper
  ): APIGatewayProxyResult {
    return {
      statusCode: this.statusCode,
      body: serializeErrorBody(
        this,
        { target: 'apiGateway', defaultBody: this.buildDefaultBody() },
        shaper
      ),
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...additionalHeaders,
      },
    };
  }

  /**
   * Returns an AWS API Gateway V2 (HTTP API) response object
   * Useful for returning errors in API Gateway V2 Lambda functions with Payload Format 2.0
   * Supports cookies in addition to standard headers
   *
   * @param additionalHeaders - Optional additional headers to include
   * @param cookies - Optional cookies to set
   * @param shaper - Overrides the shaper registered with {@link setErrorBodyShaper}
   * @returns API Gateway V2 response format
   *
   * @example
   * ```typescript
   * try {
   *   // your code
   * } catch (error) {
   *   if (error instanceof HttpError) {
   *     return error.toApiGatewayResponseV2(undefined, ['session=; Max-Age=0']);
   *   }
   *   throw error;
   * }
   * ```
   */
  public toApiGatewayResponseV2(
    additionalHeaders?: Record<string, string | boolean | number>,
    cookies?: string[],
    shaper?: ErrorBodyShaper
  ): APIGatewayProxyStructuredResultV2 {
    return {
      statusCode: this.statusCode,
      body: serializeErrorBody(
        this,
        { target: 'apiGatewayV2', defaultBody: this.buildDefaultBody() },
        shaper
      ),
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...additionalHeaders,
      },
      ...(cookies && cookies.length > 0 && { cookies }),
    };
  }

  /**
   * Returns a structured error response for non-HTTP Lambda triggers
   *
   * Only for triggers whose caller reads a **returned value** — a direct `Invoke`, or an
   * AppSync/custom integration that does. On an asynchronous trigger (EventBridge, S3, SNS)
   * or a poller (SQS, DynamoDB Streams) a returned value is indistinguishable from success:
   * see {@link rethrowLambdaError}, which is what those triggers need.
   *
   * @example
   * ```typescript
   * try {
   *   // your code
   * } catch (error) {
   *   if (error instanceof HttpError) {
   *     return error.toGenericResponse();
   *   }
   *   throw error;
   * }
   * ```
   */
  public toGenericResponse(): {
    error: string;
    code: string;
    message: string;
    statusCode: number;
    data?: Record<string, any>;
  } {
    return {
      error: this.constructor.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      data: this.data,
    };
  }
}
