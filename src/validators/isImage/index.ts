/**
 * MIME types recognised as images by {@link isImage}.
 *
 * Includes the non standard aliases that browsers and legacy clients still send
 * (`image/jpg`, `image/x-png`, `image/x-ms-bmp`).
 */
export const IMAGE_MIME_TYPES = [
  'image/apng',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jp2',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
  'image/x-ms-bmp',
  'image/x-png',
  'image/x-tiff',
] as const;

const IMAGE_MIME_TYPE_SET: ReadonlySet<string> = new Set<string>(IMAGE_MIME_TYPES);

/**
 * Checks whether a value is a common image MIME type.
 *
 * Matching is case insensitive, surrounding whitespace is ignored and MIME
 * parameters are discarded, so `' IMAGE/PNG; charset=binary '` is recognised.
 * The check is an allow list ({@link IMAGE_MIME_TYPES}) rather than an
 * `image/*` prefix test, so unknown or made up subtypes are rejected.
 *
 * @param value - Value to validate, of any type
 * @returns `true` when the value is a known image MIME type, `false` otherwise
 *
 * @example
 * ```typescript
 * isImage('image/png');                 // true
 * isImage('IMAGE/JPEG');                // true
 * isImage('image/webp; charset=binary'); // true
 * ```
 *
 * @example
 * ```typescript
 * isImage('application/pdf'); // false
 * isImage('image/notreal');   // false — not in the allow list
 * isImage('png');             // false — not a MIME type
 * isImage(undefined);         // false — non-string input never throws
 * ```
 */
export function isImage(value: unknown): boolean {
  return isKnownMimeType(value, IMAGE_MIME_TYPE_SET);
}

/**
 * Image MIME types that are **raster** data, i.e. every entry of {@link IMAGE_MIME_TYPES}
 * except SVG.
 *
 * SVG is a genuine image type, so removing it from `IMAGE_MIME_TYPES` would be wrong — but it
 * is also an XML document that a browser executes, scripts and all, which is why it is the one
 * type an upload gate usually must reject. Two names, two jobs.
 */
export const RASTER_IMAGE_MIME_TYPES = IMAGE_MIME_TYPES.filter(
  (mimeType) => mimeType !== 'image/svg+xml'
);

const RASTER_IMAGE_MIME_TYPE_SET: ReadonlySet<string> = new Set<string>(RASTER_IMAGE_MIME_TYPES);

/**
 * Checks whether a value is an image MIME type that carries raster data.
 *
 * Same normalization as {@link isImage} — case insensitive, whitespace and MIME parameters
 * ignored — but SVG is rejected, so this is the check to gate an upload that will be served
 * back to a browser.
 *
 * @param value - Value to validate, of any type
 * @returns `true` when the value is a known raster image MIME type
 *
 * @example
 * ```typescript
 * isRasterImage('image/png');     // true
 * isRasterImage('image/svg+xml'); // false — an executable document, not raster data
 * ```
 */
export function isRasterImage(value: unknown): boolean {
  return isKnownMimeType(value, RASTER_IMAGE_MIME_TYPE_SET);
}

/**
 * Normalizes a MIME type and looks it up in an allow list.
 *
 * Shared so the two checks can never disagree about what counts as `' IMAGE/PNG; q=1 '`.
 *
 * @param value - Value to validate, of any type
 * @param allowList - Set of accepted MIME types, lower-cased
 * @returns `true` when the normalized value is in the list
 */
function isKnownMimeType(value: unknown, allowList: ReadonlySet<string>): boolean {
  if (typeof value !== 'string') return false;

  const mimeType = value.split(';')[0].trim().toLowerCase();
  if (mimeType.length === 0) return false;

  return allowList.has(mimeType);
}
