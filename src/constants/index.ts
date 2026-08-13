/**
 * Public barrel for the shared constants of the package.
 *
 * Environment related constants (such as `DEFAULT_STAGE`) live in `src/environment/`
 * and are exported from there — they are deliberately not duplicated here.
 */
export { defaultRetryOptions } from './default-retry-options.js';

export {
  HttpStatus,
  HttpErrorStatus,
  isValidHttpStatus,
  isValidHttpErrorStatus,
  getHttpStatusName,
} from './http-status.js';

export type { HttpErrorStatusType } from './http-status.js';
