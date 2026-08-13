/**
 * Decodes the object key of an S3 event record.
 *
 * S3 delivers the key **URL encoded, with spaces as `+`**, so `my folder/relatório.pdf`
 * arrives as `my+folder/relat%C3%B3rio.pdf`. Handing that straight to `GetObject` fails with
 * `NoSuchKey` for every object whose name contains a space or a non-ASCII character — which
 * is the first thing anyone hits, and only for *some* of their files, which is what makes it
 * expensive to diagnose.
 *
 * The `+` substitution has to happen before `decodeURIComponent`, and the decode has to be
 * total: `decodeURIComponent` throws `URIError` on a malformed sequence (a bare `%`, which a
 * key is allowed to contain), so an unguarded call kills the invocation before the handler's
 * own error handling ever runs.
 *
 * @param key - `record.s3.object.key` from an S3 event
 * @returns The real object key, or the input unchanged when it cannot be decoded
 *
 * @example
 * ```typescript
 * import { decodeS3ObjectKey } from 'awpaki/extractors';
 *
 * for (const record of event.Records) {
 *   const key = decodeS3ObjectKey(record.s3.object.key);
 *   await s3Client.execute(new GetObjectCommand({ Bucket: bucket, Key: key }));
 * }
 * ```
 */
export function decodeS3ObjectKey(key: string): string {
  const withSpaces = key.replace(/\+/g, ' ');

  try {
    return decodeURIComponent(withSpaces);
  } catch {
    // A key S3 itself produced always decodes; one that does not is either hand-built or
    // already decoded, and returning it unchanged is strictly better than failing the
    // invocation from inside a decoder.
    return withSpaces;
  }
}
