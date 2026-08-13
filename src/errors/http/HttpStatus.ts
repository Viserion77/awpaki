/**
 * Complete HTTP Status Codes
 * Provides type-safe constants for all standard HTTP status codes
 *
 * @example
 * ```typescript
 * import { HttpStatus } from 'awpaki';
 *
 * // Success responses
 * return { statusCode: HttpStatus.OK }; // 200
 * return { statusCode: HttpStatus.CREATED }; // 201
 *
 * // Client errors
 * throw new Error(HttpStatus.NOT_FOUND); // 404
 *
 * // Server errors
 * throw new Error(HttpStatus.INTERNAL_SERVER_ERROR); // 500
 * ```
 */
export enum HttpStatus {
  // 1xx Informational
  CONTINUE = 100,
  SWITCHING_PROTOCOLS = 101,
  PROCESSING = 102,

  // 2xx Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NON_AUTHORITATIVE_INFORMATION = 203,
  NO_CONTENT = 204,
  RESET_CONTENT = 205,
  PARTIAL_CONTENT = 206,
  MULTI_STATUS = 207,
  ALREADY_REPORTED = 208,
  IM_USED = 226,

  // 3xx Redirection
  MULTIPLE_CHOICES = 300,
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  SEE_OTHER = 303,
  NOT_MODIFIED = 304,
  USE_PROXY = 305,
  TEMPORARY_REDIRECT = 307,
  PERMANENT_REDIRECT = 308,

  // 4xx Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  PAYMENT_REQUIRED = 402,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  NOT_ACCEPTABLE = 406,
  PROXY_AUTHENTICATION_REQUIRED = 407,
  REQUEST_TIMEOUT = 408,
  CONFLICT = 409,
  GONE = 410,
  LENGTH_REQUIRED = 411,
  PRECONDITION_FAILED = 412,
  PAYLOAD_TOO_LARGE = 413,
  URI_TOO_LONG = 414,
  UNSUPPORTED_MEDIA_TYPE = 415,
  RANGE_NOT_SATISFIABLE = 416,
  EXPECTATION_FAILED = 417,
  IM_A_TEAPOT = 418,
  MISDIRECTED_REQUEST = 421,
  UNPROCESSABLE_ENTITY = 422,
  LOCKED = 423,
  FAILED_DEPENDENCY = 424,
  TOO_EARLY = 425,
  UPGRADE_REQUIRED = 426,
  PRECONDITION_REQUIRED = 428,
  TOO_MANY_REQUESTS = 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE = 431,
  UNAVAILABLE_FOR_LEGAL_REASONS = 451,

  // 5xx Server Errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
  HTTP_VERSION_NOT_SUPPORTED = 505,
  VARIANT_ALSO_NEGOTIATES = 506,
  INSUFFICIENT_STORAGE = 507,
  LOOP_DETECTED = 508,
  NOT_EXTENDED = 510,
  NETWORK_AUTHENTICATION_REQUIRED = 511,
}

/**
 * HTTP Error Status Codes - Subset of HttpStatus
 * Contains only error status codes (4xx and 5xx) that have mapped error classes
 * References HttpStatus values to avoid duplication
 *
 * @example
 * ```typescript
 * import { HttpErrorStatus } from 'awpaki';
 *
 * // Use in schema
 * const schema = {
 *   body: {
 *     email: {
 *       label: 'Email',
 *       required: true,
 *       statusCodeError: HttpErrorStatus.BAD_REQUEST  // 400
 *     }
 *   }
 * };
 *
 * // Use with createHttpError
 * throw createHttpError(HttpErrorStatus.NOT_FOUND, 'User not found');
 *
 * // Type-safe validation
 * const isClientError = (code: HttpErrorStatusType) => code >= 400 && code < 500;
 * ```
 */
export const HttpErrorStatus = {
  // 4xx Client Errors
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  PRECONDITION_FAILED: HttpStatus.PRECONDITION_FAILED,
  UNPROCESSABLE_ENTITY: HttpStatus.UNPROCESSABLE_ENTITY,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,

  // 5xx Server Errors
  INTERNAL_SERVER_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
  NOT_IMPLEMENTED: HttpStatus.NOT_IMPLEMENTED,
  BAD_GATEWAY: HttpStatus.BAD_GATEWAY,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
} as const;

/**
 * Type representing valid HTTP error status codes
 * Use this type for function parameters and return types
 */
export type HttpErrorStatusType = (typeof HttpErrorStatus)[keyof typeof HttpErrorStatus];

/**
 * Numeric members of {@link HttpStatus}, for the guards below.
 *
 * A TypeScript numeric enum is a two-way map at runtime: `Object.values(HttpStatus)` yields
 * the member *names* as well as the codes, so an `includes` over it answered `true` for the
 * string `'NOT_FOUND'` — a guard that narrowed a value which is not a status code at all.
 * Filtering to numbers once, at module load, fixes the answer and makes the lookup O(1).
 */
const VALID_HTTP_STATUS_CODES: ReadonlySet<number> = new Set(
  Object.values(HttpStatus).filter((value): value is HttpStatus => typeof value === 'number')
);

/**
 * Codes of {@link HttpErrorStatus}, whose object literal has no reverse mapping but is read
 * through the same guard shape.
 */
const VALID_HTTP_ERROR_STATUS_CODES: ReadonlySet<number> = new Set(Object.values(HttpErrorStatus));

/**
 * Type guard to check if a number is a valid HTTP status code
 * Validates against all standard HTTP status codes (1xx, 2xx, 3xx, 4xx, 5xx)
 *
 * @param code - Status code to validate
 * @returns True if the code exists in HttpStatus enum
 *
 * @example
 * ```typescript
 * isValidHttpStatus(200); // true
 * isValidHttpStatus(404); // true
 * isValidHttpStatus(999); // false
 * ```
 */
export function isValidHttpStatus(code: number): code is HttpStatus {
  return VALID_HTTP_STATUS_CODES.has(code);
}

/**
 * Type guard to check if a number is a valid mapped HTTP error status code
 * Only validates error codes (4xx and 5xx) that have corresponding error classes
 *
 * @param code - Status code to validate
 * @returns True if the code is mapped in HttpErrorStatus
 *
 * @example
 * ```typescript
 * isValidHttpErrorStatus(404); // true
 * isValidHttpErrorStatus(200); // false
 * isValidHttpErrorStatus(999); // false
 * ```
 */
export function isValidHttpErrorStatus(code: number): code is HttpErrorStatusType {
  return VALID_HTTP_ERROR_STATUS_CODES.has(code);
}

/**
 * Gets the error class name for a given status code
 * Works with both HttpStatus and HttpErrorStatus
 *
 * @param status - HTTP status code
 * @returns Error class name or undefined if not mapped
 *
 * @example
 * ```typescript
 * getHttpStatusName(HttpStatus.NOT_FOUND); // "NotFound"
 * getHttpStatusName(404); // "NotFound"
 * getHttpStatusName(200); // undefined
 * getHttpStatusName(999); // undefined
 * ```
 */
export function getHttpStatusName(
  status: HttpStatus | HttpErrorStatusType | number
): string | undefined {
  const statusNames: Record<HttpErrorStatusType, string> = {
    [HttpErrorStatus.BAD_REQUEST]: 'BadRequest',
    [HttpErrorStatus.UNAUTHORIZED]: 'Unauthorized',
    [HttpErrorStatus.FORBIDDEN]: 'Forbidden',
    [HttpErrorStatus.NOT_FOUND]: 'NotFound',
    [HttpErrorStatus.CONFLICT]: 'Conflict',
    [HttpErrorStatus.PRECONDITION_FAILED]: 'PreconditionFailed',
    [HttpErrorStatus.UNPROCESSABLE_ENTITY]: 'UnprocessableEntity',
    [HttpErrorStatus.TOO_MANY_REQUESTS]: 'TooManyRequests',
    [HttpErrorStatus.INTERNAL_SERVER_ERROR]: 'InternalServerError',
    [HttpErrorStatus.NOT_IMPLEMENTED]: 'NotImplemented',
    [HttpErrorStatus.BAD_GATEWAY]: 'BadGateway',
    [HttpErrorStatus.SERVICE_UNAVAILABLE]: 'ServiceUnavailable',
  };

  return statusNames[status as HttpErrorStatusType];
}

/**
 * Stable `snake_case` code for a status, used as the default {@link HttpError.code}.
 *
 * Derived from the **status code**, never from `constructor.name`: consumers bundle Lambdas
 * with esbuild, which mangles class identifiers unless `--keep-names` is set (it is off by
 * default there, in CDK's `NodejsFunction` and in most serverless-esbuild setups), so a
 * minified `new NotFound(...).constructor.name` is `'e'`. A value that clients switch on
 * must not depend on an identifier surviving minification; object property names do survive.
 *
 * @param status - HTTP status code
 * @returns The conventional code for that status, or `http_<status>` when it has no name
 *
 * @example
 * ```typescript
 * getDefaultErrorCode(404); // 'not_found'
 * getDefaultErrorCode(418); // 'http_418'
 * ```
 */
export function getDefaultErrorCode(status: number): string {
  return DEFAULT_ERROR_CODES[status] ?? `http_${status}`;
}

const DEFAULT_ERROR_CODES: Record<number, string> = {
  [HttpErrorStatus.BAD_REQUEST]: 'bad_request',
  [HttpErrorStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpErrorStatus.FORBIDDEN]: 'forbidden',
  [HttpErrorStatus.NOT_FOUND]: 'not_found',
  [HttpErrorStatus.CONFLICT]: 'conflict',
  [HttpErrorStatus.PRECONDITION_FAILED]: 'precondition_failed',
  [HttpErrorStatus.UNPROCESSABLE_ENTITY]: 'unprocessable_entity',
  [HttpErrorStatus.TOO_MANY_REQUESTS]: 'too_many_requests',
  [HttpErrorStatus.INTERNAL_SERVER_ERROR]: 'internal_server_error',
  [HttpErrorStatus.NOT_IMPLEMENTED]: 'not_implemented',
  [HttpErrorStatus.BAD_GATEWAY]: 'bad_gateway',
  [HttpErrorStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};
