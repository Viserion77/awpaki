import { isImage, isRasterImage, IMAGE_MIME_TYPES, RASTER_IMAGE_MIME_TYPES } from './index.js';

describe('isImage', () => {
  it('should accept common image MIME types', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isImage('image/jpeg')).toBe(true);
    expect(isImage('image/gif')).toBe(true);
    expect(isImage('image/webp')).toBe(true);
    expect(isImage('image/svg+xml')).toBe(true);
    expect(isImage('image/avif')).toBe(true);
  });

  it('should accept every entry of the allow list', () => {
    IMAGE_MIME_TYPES.forEach((mimeType) => {
      expect(isImage(mimeType)).toBe(true);
    });
  });

  it('should accept the non-standard aliases clients still send', () => {
    expect(isImage('image/jpg')).toBe(true);
    expect(isImage('image/x-png')).toBe(true);
    expect(isImage('image/x-ms-bmp')).toBe(true);
    expect(isImage('image/x-icon')).toBe(true);
  });

  it('should ignore case, surrounding whitespace and MIME parameters', () => {
    expect(isImage('IMAGE/PNG')).toBe(true);
    expect(isImage('  image/jpeg  ')).toBe(true);
    expect(isImage('image/webp; charset=binary')).toBe(true);
    expect(isImage('Image/Tiff ;q=0.8')).toBe(true);
  });

  it('should reject non-image MIME types', () => {
    expect(isImage('application/pdf')).toBe(false);
    expect(isImage('text/plain')).toBe(false);
    expect(isImage('video/mp4')).toBe(false);
    expect(isImage('application/octet-stream')).toBe(false);
  });

  it('should reject unknown or malformed image subtypes', () => {
    expect(isImage('image/notreal')).toBe(false);
    expect(isImage('image/')).toBe(false);
    expect(isImage('image')).toBe(false);
    expect(isImage('png')).toBe(false);
    expect(isImage('image/pngx')).toBe(false);
    expect(isImage('')).toBe(false);
    expect(isImage('   ')).toBe(false);
  });

  it('should reject non-string values without throwing', () => {
    expect(isImage(null)).toBe(false);
    expect(isImage(undefined)).toBe(false);
    expect(isImage(0)).toBe(false);
    expect(isImage({ contentType: 'image/png' })).toBe(false);
    expect(isImage(['image/png'])).toBe(false);
    expect(isImage(true)).toBe(false);
  });

  // docs/validation.md names SVG as the reason the allow list exists instead of an
  // `image/*` prefix test — while `isImage` accepts it, because it genuinely is an image
  // type. Two names, so a gate can say which of the two jobs it is doing.
  describe('isRasterImage', () => {
    it('accepts raster types', () => {
      expect(isRasterImage('image/png')).toBe(true);
      expect(isRasterImage('IMAGE/JPEG')).toBe(true);
      expect(isRasterImage('image/webp; charset=binary')).toBe(true);
    });

    it('rejects SVG, which a browser executes', () => {
      expect(isRasterImage('image/svg+xml')).toBe(false);
      expect(isImage('image/svg+xml')).toBe(true);
    });

    it('rejects everything isImage rejects', () => {
      expect(isRasterImage('application/pdf')).toBe(false);
      expect(isRasterImage('image/notreal')).toBe(false);
      expect(isRasterImage(undefined)).toBe(false);
    });

    it('keeps the two lists from drifting apart', () => {
      expect(RASTER_IMAGE_MIME_TYPES).toEqual(
        IMAGE_MIME_TYPES.filter((mimeType) => mimeType !== 'image/svg+xml')
      );
    });
  });
});
