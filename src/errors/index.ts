export { HttpError } from './http/HttpError';
export {
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  PreconditionFailed,
  UnprocessableEntity,
  TooManyRequests,
  InternalServerError,
  NotImplemented,
  BadGateway,
  ServiceUnavailable,
  HTTP_ERROR_MAP,
  createHttpError,
} from './http/HttpErrors';
/**
 * HTTP status constants and guards.
 *
 * @deprecated Import these from `awpaki/constants` instead — that is the preferred
 * path from now on. This re-export is **not** going away in 1.x: it is the most used
 * surface of the library after the error classes, and removing it would be a breaking
 * change. Both paths resolve to the very same enum object and the very same guard
 * functions (`src/errors/http/HttpStatus.ts` remains the single source of truth), so
 * identity comparisons keep working while code migrates. Slated for removal only in
 * the next major version.
 *
 * @example
 * ```typescript
 * // preferred
 * import { HttpStatus, isValidHttpStatus } from 'awpaki/constants';
 *
 * // still supported, deprecated
 * import { HttpStatus } from 'awpaki/errors';
 * ```
 */
export {
  HttpStatus,
  HttpErrorStatus,
  isValidHttpStatus,
  isValidHttpErrorStatus,
  getHttpStatusName,
} from './http/HttpStatus';
// Type-only, so it must leave through `export type`: inside the value block above it
// would be an unresolvable name for any single-file transpiler (`isolatedModules`,
// esbuild, swc), which cannot know the specifier is erasable.
export type { HttpErrorStatusType } from './http/HttpStatus';
export {
  handleApiGatewayError,
  handleApiGatewayErrorV2,
  handleGenericError,
  handleSqsError,
  handleSnsError,
  handleEventBridgeError,
  handleS3Error,
  handleDynamoDBStreamError,
  handleAppSyncError,
  type ApiGatewayErrorResponse,
  type ApiGatewayErrorResponseV2,
  type GenericLambdaErrorResponse,
} from './handlers/handleLambdaError';
