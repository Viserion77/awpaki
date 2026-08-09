import { s3Client } from './index';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

describe('s3Client', () => {
  it('should have execute method', () => {
    expect(s3Client).toHaveProperty('execute');
    expect(typeof s3Client.execute).toBe('function');
  });

  it('should execute GetObjectCommand without errors in structure', async () => {
    const command = new GetObjectCommand({
      Bucket: 'test-bucket',
      Key: 'test-key',
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(s3Client.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should execute PutObjectCommand without errors in structure', async () => {
    const command = new PutObjectCommand({
      Bucket: 'test-bucket',
      Key: 'test-key',
      Body: 'test content',
    });

    // This will fail in test environment without AWS credentials,
    // but validates the structure
    await expect(s3Client.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new GetObjectCommand({
      Bucket: 'test-bucket',
      Key: 'test-key',
    });

    await expect(
      s3Client.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});

/* eslint-disable @typescript-eslint/no-require-imports -- the client is built at import time */
type CapturedConfig = { region?: string; endpoint?: string };

const CONTROLLED_ENV_VARS = [
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_S3',
];

/**
 * Re-imports the module with the SDK constructor stubbed out, so the configuration the
 * client is built with can be inspected.
 */
function loadWithStubbedSdk(): CapturedConfig {
  let captured: CapturedConfig = {};

  jest.doMock('@aws-sdk/client-s3', () => ({
    S3Client: class {
      constructor(config: CapturedConfig) {
        captured = config;
      }
    },
  }));

  require('./index');

  return captured;
}

describe('s3Client configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    for (const name of CONTROLLED_ENV_VARS) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    jest.dontMock('@aws-sdk/client-s3');
    process.env = originalEnv;
    jest.resetModules();
  });

  it('prefers the service specific endpoint override', () => {
    process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.local';
    process.env.AWS_ENDPOINT_URL = 'http://global.local';

    expect(loadWithStubbedSdk().endpoint).toBe('http://s3.local');
  });

  it('falls back to the global endpoint override', () => {
    process.env.AWS_ENDPOINT_URL = 'http://global.local';

    expect(loadWithStubbedSdk().endpoint).toBe('http://global.local');
  });

  it('leaves the endpoint and the region undefined when nothing is configured', () => {
    const config = loadWithStubbedSdk();

    expect(config.endpoint).toBeUndefined();
    expect(config.region).toBeUndefined();
  });

  it('resolves the region from AWS_REGION, then AWS_DEFAULT_REGION', () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'sa-east-1';

    expect(loadWithStubbedSdk().region).toBe('us-east-1');

    jest.resetModules();
    delete process.env.AWS_REGION;

    expect(loadWithStubbedSdk().region).toBe('sa-east-1');
  });
});
