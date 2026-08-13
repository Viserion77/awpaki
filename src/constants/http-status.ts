/**
 * HTTP status constants and guards, exposed under the `awpaki/constants` surface.
 *
 * DESIGN DECISION (intentional, do not "fix"): this file is a pure re-export of
 * `src/errors/http/HttpStatus.ts`, which remains the single source of truth.
 *
 * Why not move the source file here?
 * - `HttpStatus` / `HttpErrorStatus` are re-exported today by `src/errors/index.ts`
 *   (and therefore by `awpaki` and `awpaki/errors`). Physically moving the module
 *   would churn every internal import in `src/errors/http/**` and risk breaking the
 *   published deep paths, which is a breaking change and belongs to a major release.
 * - Re-exporting gives `constants/` its public surface right now, at zero risk: the
 *   very same enum object, the very same guard functions (identity is preserved, so
 *   `instanceof`/`toBe` comparisons across both paths keep working).
 *
 * The physical move (and deprecating the `errors/` re-export) is deferred to the next
 * major version.
 */
export {
  HttpStatus,
  HttpErrorStatus,
  isValidHttpStatus,
  isValidHttpErrorStatus,
  getHttpStatusName,
  getDefaultErrorCode,
} from '../errors/http/HttpStatus.js';

export type { HttpErrorStatusType } from '../errors/http/HttpStatus.js';
