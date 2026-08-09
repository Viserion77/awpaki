import { DEFAULT_STAGE, resolveStage } from './resolveStage';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.STAGE;
  delete process.env.NODE_ENV;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('DEFAULT_STAGE', () => {
  it('is "dev"', () => {
    expect(DEFAULT_STAGE).toBe('dev');
  });
});

describe('resolveStage', () => {
  it('returns STAGE when it is set', () => {
    process.env.STAGE = 'prod';

    expect(resolveStage()).toBe('prod');
  });

  it('prefers STAGE over NODE_ENV when both are set', () => {
    process.env.STAGE = 'staging';
    process.env.NODE_ENV = 'production';

    expect(resolveStage()).toBe('staging');
  });

  it('falls back to NODE_ENV when STAGE is not set', () => {
    process.env.NODE_ENV = 'production';

    expect(resolveStage()).toBe('production');
  });

  it('falls back to NODE_ENV when STAGE is an empty string', () => {
    process.env.STAGE = '';
    process.env.NODE_ENV = 'test';

    expect(resolveStage()).toBe('test');
  });

  it('falls back to DEFAULT_STAGE when neither variable is set', () => {
    expect(resolveStage()).toBe(DEFAULT_STAGE);
    expect(resolveStage()).toBe('dev');
  });

  it('falls back to DEFAULT_STAGE when both variables are empty strings', () => {
    process.env.STAGE = '';
    process.env.NODE_ENV = '';

    expect(resolveStage()).toBe('dev');
  });

  it('never returns undefined or an empty string', () => {
    process.env.STAGE = '';
    process.env.NODE_ENV = '';

    const stage = resolveStage();

    expect(typeof stage).toBe('string');
    expect(stage.length).toBeGreaterThan(0);
  });

  it('does not trim the value it finds', () => {
    process.env.STAGE = ' prod ';

    expect(resolveStage()).toBe(' prod ');
  });

  it('ignores unrelated variables', () => {
    process.env.AWS_REGION = 'us-east-1';

    expect(resolveStage()).toBe('dev');
  });

  it('reflects changes made to the environment after the module was imported', () => {
    expect(resolveStage()).toBe('dev');

    process.env.STAGE = 'qa';

    expect(resolveStage()).toBe('qa');
  });
});
