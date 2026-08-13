import { DEFAULT_STAGE, resolveStage } from './resolveStage.js';

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

  describe('options', () => {
    // Bundlers force NODE_ENV to production and Jest forces it to test, while Lambda never
    // sets STAGE — so the default chain reports 'production' for a dev deployment.
    it('can leave NODE_ENV out of the chain', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.STAGE;

      expect(resolveStage()).toBe('production');
      expect(resolveStage({ allowNodeEnv: false })).toBe(DEFAULT_STAGE);
    });

    it('still prefers STAGE when NODE_ENV is excluded', () => {
      process.env.STAGE = 'staging';
      process.env.NODE_ENV = 'production';

      expect(resolveStage({ allowNodeEnv: false })).toBe('staging');
    });

    it('accepts a different fallback stage', () => {
      delete process.env.STAGE;
      delete process.env.NODE_ENV;

      expect(resolveStage({ defaultStage: 'local' })).toBe('local');
    });

    it('keeps the no-argument behaviour byte-identical', () => {
      delete process.env.STAGE;
      delete process.env.NODE_ENV;

      expect(resolveStage()).toBe(DEFAULT_STAGE);
    });
  });
});
