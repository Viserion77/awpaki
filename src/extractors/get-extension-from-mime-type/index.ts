/**
 * Known file extensions returned by {@link getExtensionFromMimeType}.
 *
 * Values are the bare extension, without a leading dot.
 */
export enum FILE_EXTENSIONS {
  // Images
  JPG = 'jpg',
  PNG = 'png',
  GIF = 'gif',
  WEBP = 'webp',
  SVG = 'svg',
  BMP = 'bmp',
  TIFF = 'tiff',
  ICO = 'ico',

  // Documents
  PDF = 'pdf',
  DOC = 'doc',
  DOCX = 'docx',
  XLS = 'xls',
  XLSX = 'xlsx',
  PPT = 'ppt',
  PPTX = 'pptx',
  TXT = 'txt',
  CSV = 'csv',
  RTF = 'rtf',

  // Archives
  ZIP = 'zip',
  GZ = 'gz',
  TAR = 'tar',
  RAR = 'rar',
  SEVEN_ZIP = '7z',

  // Audio / video
  MP3 = 'mp3',
  WAV = 'wav',
  MP4 = 'mp4',
  MPEG = 'mpeg',
  WEBM = 'webm',

  // Data / markup
  JSON = 'json',
  XML = 'xml',
  HTML = 'html',
}

/**
 * Frozen lookup table mapping a normalized MIME type to its file extension.
 *
 * Keys are always lowercase and free of parameters (no `; charset=utf-8`), which is
 * exactly the shape {@link getExtensionFromMimeType} normalizes its input to.
 * Besides the canonical IANA types, a few widespread legacy aliases are included
 * (`image/jpg`, `text/xml`, `application/x-rar-compressed`, ...).
 */
export const MIME_TYPE_TO_EXTENSION = Object.freeze({
  // Images
  'image/jpeg': FILE_EXTENSIONS.JPG,
  'image/jpg': FILE_EXTENSIONS.JPG,
  'image/png': FILE_EXTENSIONS.PNG,
  'image/gif': FILE_EXTENSIONS.GIF,
  'image/webp': FILE_EXTENSIONS.WEBP,
  'image/svg+xml': FILE_EXTENSIONS.SVG,
  'image/bmp': FILE_EXTENSIONS.BMP,
  'image/tiff': FILE_EXTENSIONS.TIFF,
  'image/x-icon': FILE_EXTENSIONS.ICO,
  'image/vnd.microsoft.icon': FILE_EXTENSIONS.ICO,

  // Documents
  'application/pdf': FILE_EXTENSIONS.PDF,
  'application/msword': FILE_EXTENSIONS.DOC,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FILE_EXTENSIONS.DOCX,
  'application/vnd.ms-excel': FILE_EXTENSIONS.XLS,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_EXTENSIONS.XLSX,
  'application/vnd.ms-powerpoint': FILE_EXTENSIONS.PPT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': FILE_EXTENSIONS.PPTX,
  'text/plain': FILE_EXTENSIONS.TXT,
  'text/csv': FILE_EXTENSIONS.CSV,
  'application/rtf': FILE_EXTENSIONS.RTF,
  'text/rtf': FILE_EXTENSIONS.RTF,

  // Archives
  'application/zip': FILE_EXTENSIONS.ZIP,
  'application/x-zip-compressed': FILE_EXTENSIONS.ZIP,
  'application/gzip': FILE_EXTENSIONS.GZ,
  'application/x-gzip': FILE_EXTENSIONS.GZ,
  'application/x-tar': FILE_EXTENSIONS.TAR,
  'application/vnd.rar': FILE_EXTENSIONS.RAR,
  'application/x-rar-compressed': FILE_EXTENSIONS.RAR,
  'application/x-7z-compressed': FILE_EXTENSIONS.SEVEN_ZIP,

  // Audio / video
  'audio/mpeg': FILE_EXTENSIONS.MP3,
  'audio/mp3': FILE_EXTENSIONS.MP3,
  'audio/wav': FILE_EXTENSIONS.WAV,
  'audio/x-wav': FILE_EXTENSIONS.WAV,
  'video/mp4': FILE_EXTENSIONS.MP4,
  'video/mpeg': FILE_EXTENSIONS.MPEG,
  'video/webm': FILE_EXTENSIONS.WEBM,
  'audio/webm': FILE_EXTENSIONS.WEBM,

  // Data / markup
  'application/json': FILE_EXTENSIONS.JSON,
  'application/xml': FILE_EXTENSIONS.XML,
  'text/xml': FILE_EXTENSIONS.XML,
  'text/html': FILE_EXTENSIONS.HTML,
}) satisfies Readonly<Record<string, FILE_EXTENSIONS>>;

/**
 * Union of every MIME type recognized by {@link getExtensionFromMimeType}.
 */
export type KnownMimeType = keyof typeof MIME_TYPE_TO_EXTENSION;

/**
 * Normalizes a raw MIME type header value into a plain lookup key.
 *
 * Drops any media type parameters (everything after the first `;`), trims
 * surrounding whitespace and lowercases the result.
 *
 * @param {string} mimeType - Raw MIME type, possibly with parameters and mixed case
 * @returns {string} The normalized MIME type, or an empty string when there is nothing to look up
 */
function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/**
 * Resolves the file extension associated with a MIME type.
 *
 * The input is normalized before the lookup, so `Content-Type` header values can be
 * passed straight through: casing is ignored, surrounding whitespace is trimmed and
 * media type parameters such as `; charset=utf-8` or `; boundary=...` are discarded.
 *
 * Returns `undefined` for unknown, empty or non-string input instead of throwing, so it
 * is safe to call with untrusted Lambda event data.
 *
 * @param {string} mimeType - MIME type to resolve (e.g. `'image/png'`, `'text/plain; charset=utf-8'`)
 * @returns {string | undefined} The extension without a leading dot, or `undefined` when unknown
 *
 * @example
 * ```typescript
 * import { getExtensionFromMimeType } from 'awpaki/extractors';
 *
 * getExtensionFromMimeType('image/png'); // 'png'
 * getExtensionFromMimeType('application/pdf'); // 'pdf'
 * ```
 *
 * @example
 * ```typescript
 * // Casing, whitespace and parameters are ignored
 * getExtensionFromMimeType('  TEXT/Plain; charset=UTF-8  '); // 'txt'
 * ```
 *
 * @example
 * ```typescript
 * // Unknown or empty input resolves to undefined
 * getExtensionFromMimeType('application/x-unknown'); // undefined
 * getExtensionFromMimeType(''); // undefined
 * ```
 *
 * @example
 * ```typescript
 * // Building an S3 key from an upload's content type
 * const extension = getExtensionFromMimeType(event.headers['content-type'] ?? '') ?? 'bin';
 * const key = `uploads/${crypto.randomUUID()}.${extension}`;
 * ```
 */
export function getExtensionFromMimeType(mimeType: string): string | undefined {
  if (typeof mimeType !== 'string') {
    return undefined;
  }

  const normalized = normalizeMimeType(mimeType);

  if (normalized === '' || !Object.hasOwn(MIME_TYPE_TO_EXTENSION, normalized)) {
    return undefined;
  }

  return MIME_TYPE_TO_EXTENSION[normalized as KnownMimeType];
}
