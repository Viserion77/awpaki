import { HttpStatus, BadRequest } from '../../errors/index.js';
import { extractEventParams } from '../../extractors/index.js';
import type { EventSchema } from '../../extractors/index.js';
import { fromSanitizer } from './index.js';

const sanitizeSlug = (raw: unknown): string | undefined => {
  const slug = String(raw ?? '')
    .trim()
    .toLowerCase();

  return /^[a-z0-9-]{3,60}$/.test(slug) ? slug : undefined;
};

describe('fromSanitizer', () => {
  it('returns the sanitized value when the input is usable', () => {
    expect(fromSanitizer(sanitizeSlug)('  My-Slug  ')).toBe('my-slug');
  });

  it('throws when the sanitizer rejects the input', () => {
    expect(() => fromSanitizer(sanitizeSlug)('no')).toThrow('Invalid value');
  });

  it('carries a caller-supplied message', () => {
    expect(() => fromSanitizer(sanitizeSlug, 'Not a slug')('no')).toThrow('Not a slug');
  });

  it('rejects a non-function instead of failing on the first request', () => {
    expect(() => fromSanitizer('nope' as never)).toThrow(TypeError);
  });

  describe('inside a schema', () => {
    const schema: EventSchema = {
      pathParameters: {
        slug: {
          label: 'Slug',
          required: true,
          decoder: fromSanitizer(sanitizeSlug),
          statusCodeError: HttpStatus.BAD_REQUEST,
        },
      },
    };

    it('passes the sanitized value through', () => {
      expect(extractEventParams(schema, { pathParameters: { slug: 'My-Slug' } })).toEqual({
        slug: 'my-slug',
      });
    });

    // The point of the adapter: a sanitizer plugged in directly returns `undefined`, which
    // the extractor assigns as-is — so the handler gets `params.slug === undefined` and a 200.
    it('makes a rejected value a validation failure, with the schema deciding the status', () => {
      expect(() => extractEventParams(schema, { pathParameters: { slug: 'no' } })).toThrow(
        BadRequest
      );
    });

    it('shows what the unadapted sanitizer would have done', () => {
      const unadapted: EventSchema = {
        pathParameters: { slug: { label: 'Slug', required: true, decoder: sanitizeSlug } },
      };

      expect(extractEventParams(unadapted, { pathParameters: { slug: 'no' } })).toEqual({
        slug: undefined,
      });
    });
  });
});
