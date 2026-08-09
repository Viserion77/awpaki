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
  if (typeof value !== 'string') return false;

  const mimeType = value.split(';')[0].trim().toLowerCase();
  if (mimeType.length === 0) return false;

  return IMAGE_MIME_TYPE_SET.has(mimeType);
}
