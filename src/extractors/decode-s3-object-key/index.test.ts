import { decodeS3ObjectKey } from './index.js';

describe('decodeS3ObjectKey', () => {
  it('turns + into a space, which is what S3 sends', () => {
    expect(decodeS3ObjectKey('my+folder/my+file.pdf')).toBe('my folder/my file.pdf');
  });

  it('percent-decodes non-ASCII characters', () => {
    expect(decodeS3ObjectKey('uploads/relat%C3%B3rio.pdf')).toBe('uploads/relatório.pdf');
  });

  // The order matters: decoding first would leave `+` in place, since `%2B` is the encoded
  // plus and a literal `+` means a space.
  it('substitutes the space before decoding, so an encoded plus survives', () => {
    expect(decodeS3ObjectKey('a+b%2Bc')).toBe('a b+c');
  });

  it('leaves an already plain key alone', () => {
    expect(decodeS3ObjectKey('uploads/file.pdf')).toBe('uploads/file.pdf');
  });

  // `decodeURIComponent` throws URIError on a lone `%`, and an unguarded call inside an entry
  // logger killed the invocation before the handler could report anything.
  it('never throws on a malformed sequence', () => {
    expect(decodeS3ObjectKey('100%+off')).toBe('100% off');
    expect(decodeS3ObjectKey('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('handles an empty key', () => {
    expect(decodeS3ObjectKey('')).toBe('');
  });
});
