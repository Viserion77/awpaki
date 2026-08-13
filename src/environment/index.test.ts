import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as environment from './index.js';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AWS_REGION;
  delete process.env.AWS_DEFAULT_REGION;
  delete process.env.AWS_ENDPOINT_URL;
  delete process.env.AWS_ENDPOINT_URL_SQS;
  delete process.env.STAGE;
  delete process.env.NODE_ENV;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('environment barrel', () => {
  it('exports the three resolvers and the default stage', () => {
    expect(typeof environment.resolveRegion).toBe('function');
    expect(typeof environment.resolveEndpoint).toBe('function');
    expect(typeof environment.resolveStage).toBe('function');
    expect(environment.DEFAULT_STAGE).toBe('dev');
  });

  it('keeps the public surface limited to the documented symbols', () => {
    expect(Object.keys(environment).sort()).toEqual([
      'DEFAULT_STAGE',
      'isLocalEnvironment',
      'resolveEndpoint',
      'resolveRegion',
      'resolveStage',
    ]);
  });

  it('does not leak the internal readFirstEnv helper', () => {
    expect(environment).not.toHaveProperty('readFirstEnv');
  });

  it('resolves a full client configuration from the environment', () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ENDPOINT_URL_SQS = 'http://sqs.localhost:4566';
    process.env.STAGE = 'prod';

    expect({
      region: environment.resolveRegion(),
      endpoint: environment.resolveEndpoint('AWS_ENDPOINT_URL_SQS'),
      stage: environment.resolveStage(),
    }).toEqual({
      region: 'us-east-1',
      endpoint: 'http://sqs.localhost:4566',
      stage: 'prod',
    });
  });

  it('yields an all-undefined client configuration on a bare environment', () => {
    expect(environment.resolveRegion()).toBeUndefined();
    expect(environment.resolveEndpoint('AWS_ENDPOINT_URL_SQS')).toBeUndefined();
    expect(environment.resolveStage()).toBe('dev');
  });
});

describe('environment module purity', () => {
  const moduleDir = __dirname;
  const sourceFiles = readdirSync(moduleDir).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
  );

  it('has source files to inspect', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(sourceFiles)('%s does not import any @aws-sdk package', (file) => {
    const contents = readFileSync(join(moduleDir, file), 'utf8');

    expect(contents).not.toMatch(/from\s+['"]@aws-sdk/);
    expect(contents).not.toMatch(/require\(\s*['"]@aws-sdk/);
  });

  it.each(sourceFiles)('%s does not import aws-lambda', (file) => {
    const contents = readFileSync(join(moduleDir, file), 'utf8');

    expect(contents).not.toMatch(/from\s+['"]aws-lambda['"]/);
  });
});
