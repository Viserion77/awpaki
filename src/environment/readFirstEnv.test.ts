import { readFirstEnv } from './readFirstEnv';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FIRST_VAR;
  delete process.env.SECOND_VAR;
  delete process.env.THIRD_VAR;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('readFirstEnv', () => {
  it('returns the value of the first variable when it is set', () => {
    process.env.FIRST_VAR = 'first';
    process.env.SECOND_VAR = 'second';

    expect(readFirstEnv('FIRST_VAR', 'SECOND_VAR')).toBe('first');
  });

  it('respects the order of the names, not the order of assignment', () => {
    process.env.SECOND_VAR = 'second';
    process.env.FIRST_VAR = 'first';

    expect(readFirstEnv('SECOND_VAR', 'FIRST_VAR')).toBe('second');
  });

  it('falls through to the next variable when the previous one is undefined', () => {
    process.env.SECOND_VAR = 'second';

    expect(readFirstEnv('FIRST_VAR', 'SECOND_VAR')).toBe('second');
  });

  it('treats an empty string as absent and falls through', () => {
    process.env.FIRST_VAR = '';
    process.env.SECOND_VAR = 'second';

    expect(readFirstEnv('FIRST_VAR', 'SECOND_VAR')).toBe('second');
  });

  it('returns undefined when every variable is empty', () => {
    process.env.FIRST_VAR = '';
    process.env.SECOND_VAR = '';

    expect(readFirstEnv('FIRST_VAR', 'SECOND_VAR')).toBeUndefined();
  });

  it('returns undefined when no variable is set', () => {
    expect(readFirstEnv('FIRST_VAR', 'SECOND_VAR')).toBeUndefined();
  });

  it('returns undefined when called without any name', () => {
    expect(readFirstEnv()).toBeUndefined();
  });

  it('does not trim values: whitespace-only short-circuits the chain', () => {
    process.env.FIRST_VAR = '   ';
    process.env.SECOND_VAR = 'second';

    expect(readFirstEnv('FIRST_VAR', 'SECOND_VAR')).toBe('   ');
  });

  it('walks past several empty variables to reach the last one', () => {
    process.env.FIRST_VAR = '';
    process.env.SECOND_VAR = '';
    process.env.THIRD_VAR = 'third';

    expect(readFirstEnv('FIRST_VAR', 'SECOND_VAR', 'THIRD_VAR')).toBe('third');
  });

  it('reads the environment on every call instead of caching it', () => {
    expect(readFirstEnv('FIRST_VAR')).toBeUndefined();

    process.env.FIRST_VAR = 'later';

    expect(readFirstEnv('FIRST_VAR')).toBe('later');
  });
});
