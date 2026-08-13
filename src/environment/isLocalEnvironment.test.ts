import { isLocalEnvironment } from './isLocalEnvironment.js';

describe('isLocalEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AWS_ENDPOINT_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is false on a real deployment, where nothing overrides the endpoint', () => {
    expect(isLocalEnvironment()).toBe(false);
  });

  it('is true once an emulator endpoint is configured', () => {
    process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';

    expect(isLocalEnvironment()).toBe(true);
  });

  // Same rule as the rest of the environment cascade: an empty variable counts as absent.
  it('treats an empty or blank value as absent', () => {
    process.env.AWS_ENDPOINT_URL = '';
    expect(isLocalEnvironment()).toBe(false);

    process.env.AWS_ENDPOINT_URL = '   ';
    expect(isLocalEnvironment()).toBe(false);
  });
});
