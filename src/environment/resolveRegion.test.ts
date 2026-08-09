import { resolveRegion } from './resolveRegion';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AWS_REGION;
  delete process.env.AWS_DEFAULT_REGION;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('resolveRegion', () => {
  it('returns AWS_REGION when it is set', () => {
    process.env.AWS_REGION = 'us-east-1';

    expect(resolveRegion()).toBe('us-east-1');
  });

  it('prefers AWS_REGION over AWS_DEFAULT_REGION when both are set', () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'sa-east-1';

    expect(resolveRegion()).toBe('us-east-1');
  });

  it('falls back to AWS_DEFAULT_REGION when AWS_REGION is not set', () => {
    process.env.AWS_DEFAULT_REGION = 'sa-east-1';

    expect(resolveRegion()).toBe('sa-east-1');
  });

  it('falls back to AWS_DEFAULT_REGION when AWS_REGION is an empty string', () => {
    process.env.AWS_REGION = '';
    process.env.AWS_DEFAULT_REGION = 'eu-west-1';

    expect(resolveRegion()).toBe('eu-west-1');
  });

  it('returns undefined when neither variable is set', () => {
    expect(resolveRegion()).toBeUndefined();
  });

  it('returns undefined when both variables are empty strings', () => {
    process.env.AWS_REGION = '';
    process.env.AWS_DEFAULT_REGION = '';

    expect(resolveRegion()).toBeUndefined();
  });

  it('returns undefined — never an empty string — so the SDK keeps its own resolution chain', () => {
    process.env.AWS_REGION = '';

    const region = resolveRegion();

    expect(region).toBeUndefined();
    expect(region).not.toBe('');
  });

  it('does not trim the value it finds', () => {
    process.env.AWS_REGION = ' us-east-1 ';

    expect(resolveRegion()).toBe(' us-east-1 ');
  });

  it('ignores unrelated AWS variables', () => {
    process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

    expect(resolveRegion()).toBeUndefined();
  });

  it('reflects changes made to the environment after the module was imported', () => {
    expect(resolveRegion()).toBeUndefined();

    process.env.AWS_REGION = 'ap-south-1';

    expect(resolveRegion()).toBe('ap-south-1');
  });
});
