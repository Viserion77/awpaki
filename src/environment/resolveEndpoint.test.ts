import { resolveEndpoint } from './resolveEndpoint.js';

const ORIGINAL_ENV = process.env;

const TIMESTREAM_QUERY = 'AWS_ENDPOINT_URL_TIMESTREAM_QUERY';
const TIMESTREAM_WRITE = 'AWS_ENDPOINT_URL_TIMESTREAM_WRITE';
const TIMESTREAM = 'AWS_ENDPOINT_URL_TIMESTREAM';

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AWS_ENDPOINT_URL;
  delete process.env.AWS_ENDPOINT_URL_S3;
  delete process.env.AWS_ENDPOINT_URL_DYNAMODB;
  delete process.env[TIMESTREAM];
  delete process.env[TIMESTREAM_QUERY];
  delete process.env[TIMESTREAM_WRITE];
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('resolveEndpoint', () => {
  describe('two-level cascade (11 of the 12 clients)', () => {
    it('returns the service variable when it is set', () => {
      process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.localhost:4566';

      expect(resolveEndpoint('AWS_ENDPOINT_URL_S3')).toBe('http://s3.localhost:4566');
    });

    it('prefers the service variable over the global override', () => {
      process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.localhost:4566';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint('AWS_ENDPOINT_URL_S3')).toBe('http://s3.localhost:4566');
    });

    it('falls back to AWS_ENDPOINT_URL when the service variable is not set', () => {
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint('AWS_ENDPOINT_URL_S3')).toBe('http://localhost:4566');
    });

    it('falls back to AWS_ENDPOINT_URL when the service variable is an empty string', () => {
      process.env.AWS_ENDPOINT_URL_S3 = '';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint('AWS_ENDPOINT_URL_S3')).toBe('http://localhost:4566');
    });

    it('returns undefined when nothing is set', () => {
      expect(resolveEndpoint('AWS_ENDPOINT_URL_S3')).toBeUndefined();
    });

    it('returns undefined when both the service variable and the global one are empty', () => {
      process.env.AWS_ENDPOINT_URL_S3 = '';
      process.env.AWS_ENDPOINT_URL = '';

      const endpoint = resolveEndpoint('AWS_ENDPOINT_URL_S3');

      expect(endpoint).toBeUndefined();
      expect(endpoint).not.toBe('');
    });

    it('ignores the service variable of another service', () => {
      process.env.AWS_ENDPOINT_URL_DYNAMODB = 'http://dynamo.localhost:4566';

      expect(resolveEndpoint('AWS_ENDPOINT_URL_S3')).toBeUndefined();
    });
  });

  describe('three-level cascade (Timestream)', () => {
    it('prefers the query-specific variable over the shared and global ones', () => {
      process.env[TIMESTREAM_QUERY] = 'http://query.localhost:4566';
      process.env[TIMESTREAM] = 'http://timestream.localhost:4566';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBe('http://query.localhost:4566');
    });

    it('falls back to the shared Timestream variable when the query one is not set', () => {
      process.env[TIMESTREAM] = 'http://timestream.localhost:4566';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBe(
        'http://timestream.localhost:4566'
      );
    });

    it('falls back to the shared Timestream variable when the query one is empty', () => {
      process.env[TIMESTREAM_QUERY] = '';
      process.env[TIMESTREAM] = 'http://timestream.localhost:4566';

      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBe(
        'http://timestream.localhost:4566'
      );
    });

    it('falls back to the global override when both Timestream variables are unset', () => {
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBe('http://localhost:4566');
    });

    it('falls back to the global override when both Timestream variables are empty', () => {
      process.env[TIMESTREAM_QUERY] = '';
      process.env[TIMESTREAM] = '';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBe('http://localhost:4566');
    });

    it('returns undefined when none of the three levels is set', () => {
      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBeUndefined();
    });

    it('keeps the query and write cascades independent', () => {
      process.env[TIMESTREAM_QUERY] = 'http://query.localhost:4566';
      process.env[TIMESTREAM] = 'http://timestream.localhost:4566';

      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBe('http://query.localhost:4566');
      expect(resolveEndpoint(TIMESTREAM_WRITE, TIMESTREAM)).toBe(
        'http://timestream.localhost:4566'
      );
    });

    it('matches the pre-refactor behaviour of src/clients/timestream/index.ts', () => {
      process.env[TIMESTREAM_WRITE] = 'http://write.localhost:4566';
      process.env[TIMESTREAM] = 'http://timestream.localhost:4566';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      const inlinedQuery =
        process.env[TIMESTREAM_QUERY] || process.env[TIMESTREAM] || process.env.AWS_ENDPOINT_URL;
      const inlinedWrite =
        process.env[TIMESTREAM_WRITE] || process.env[TIMESTREAM] || process.env.AWS_ENDPOINT_URL;

      expect(resolveEndpoint(TIMESTREAM_QUERY, TIMESTREAM)).toBe(inlinedQuery);
      expect(resolveEndpoint(TIMESTREAM_WRITE, TIMESTREAM)).toBe(inlinedWrite);
    });
  });

  describe('argument handling', () => {
    it('reads only the global override when called without arguments', () => {
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint()).toBe('http://localhost:4566');
    });

    it('returns undefined when called without arguments and no global override is set', () => {
      expect(resolveEndpoint()).toBeUndefined();
    });

    it('honours the declared order even when a lower-precedence variable is set first', () => {
      process.env[TIMESTREAM] = 'http://timestream.localhost:4566';
      process.env[TIMESTREAM_QUERY] = 'http://query.localhost:4566';

      expect(resolveEndpoint(TIMESTREAM, TIMESTREAM_QUERY)).toBe(
        'http://timestream.localhost:4566'
      );
    });

    it('tolerates AWS_ENDPOINT_URL being passed explicitly', () => {
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

      expect(resolveEndpoint('AWS_ENDPOINT_URL')).toBe('http://localhost:4566');
    });

    it('does not trim the value it finds', () => {
      process.env.AWS_ENDPOINT_URL_S3 = ' http://s3.localhost:4566 ';

      expect(resolveEndpoint('AWS_ENDPOINT_URL_S3')).toBe(' http://s3.localhost:4566 ');
    });
  });
});
