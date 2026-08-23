import { QueryCommand } from '@aws-sdk/client-timestream-query';
import { ListDatabasesCommand } from '@aws-sdk/client-timestream-write';
import { timestreamQueryClient, timestreamWriteClient } from './index.js';
import type { AwsCommand } from '../index.types.js';

describe('timestream clients', () => {
  it('should have execute methods', () => {
    expect(timestreamQueryClient).toHaveProperty('execute');
    expect(timestreamWriteClient).toHaveProperty('execute');
    expect(typeof timestreamQueryClient.execute).toBe('function');
    expect(typeof timestreamWriteClient.execute).toBe('function');
  });

  it('should execute QueryCommand without errors in structure', async () => {
    const command = new QueryCommand({ QueryString: 'SELECT 1' });

    await expect(timestreamQueryClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should execute ListDatabasesCommand without errors in structure', async () => {
    const command = new ListDatabasesCommand({});

    await expect(timestreamWriteClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new QueryCommand({ QueryString: 'SELECT 1' });

    await expect(
      timestreamQueryClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});

/* eslint-disable @typescript-eslint/no-require-imports -- the clients are built at import time */
type CapturedConfig = { region?: string; endpoint?: string };

const CONTROLLED_ENV_VARS = [
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_TIMESTREAM',
  'AWS_ENDPOINT_URL_TIMESTREAM_QUERY',
  'AWS_ENDPOINT_URL_TIMESTREAM_WRITE',
];

/**
 * Re-imports the module with the SDK constructors stubbed out, so the configuration each
 * Timestream client is built with can be inspected.
 */
function loadWithStubbedSdk(): { query: CapturedConfig; write: CapturedConfig } {
  const captured: { query: CapturedConfig; write: CapturedConfig } = { query: {}, write: {} };

  jest.doMock('@aws-sdk/client-timestream-query', () => ({
    TimestreamQueryClient: class {
      constructor(config: CapturedConfig) {
        captured.query = config;
      }
    },
  }));

  jest.doMock('@aws-sdk/client-timestream-write', () => ({
    TimestreamWriteClient: class {
      constructor(config: CapturedConfig) {
        captured.write = config;
      }
    },
  }));

  const mod = require('./index.js') as typeof import('./index.js');

  // Both clients are built on first use now, so each one needs a call to exist. The stubs
  // have no `send`; the constructor has already run by the time that matters. `execute` only
  // accepts real commands, so the empty probe is asserted through the parameter type.
  void mod.timestreamQueryClient.execute({} as AwsCommand).catch(() => undefined);
  void mod.timestreamWriteClient.execute({} as AwsCommand).catch(() => undefined);

  return captured;
}

describe('timestream client configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    for (const name of CONTROLLED_ENV_VARS) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    jest.dontMock('@aws-sdk/client-timestream-query');
    jest.dontMock('@aws-sdk/client-timestream-write');
    process.env = originalEnv;
    jest.resetModules();
  });

  it('prefers the operation specific endpoint override', () => {
    process.env.AWS_ENDPOINT_URL_TIMESTREAM_QUERY = 'http://query.local';
    process.env.AWS_ENDPOINT_URL_TIMESTREAM_WRITE = 'http://write.local';
    process.env.AWS_ENDPOINT_URL_TIMESTREAM = 'http://timestream.local';
    process.env.AWS_ENDPOINT_URL = 'http://global.local';

    const { query, write } = loadWithStubbedSdk();

    expect(query.endpoint).toBe('http://query.local');
    expect(write.endpoint).toBe('http://write.local');
  });

  it('falls back to the shared timestream override for the missing operation', () => {
    process.env.AWS_ENDPOINT_URL_TIMESTREAM_QUERY = 'http://query.local';
    process.env.AWS_ENDPOINT_URL_TIMESTREAM = 'http://timestream.local';
    process.env.AWS_ENDPOINT_URL = 'http://global.local';

    const { query, write } = loadWithStubbedSdk();

    expect(query.endpoint).toBe('http://query.local');
    expect(write.endpoint).toBe('http://timestream.local');
  });

  it('falls back to the global override when no timestream variable is set', () => {
    process.env.AWS_ENDPOINT_URL = 'http://global.local';

    const { query, write } = loadWithStubbedSdk();

    expect(query.endpoint).toBe('http://global.local');
    expect(write.endpoint).toBe('http://global.local');
  });

  it('treats an empty variable as absent and keeps walking the cascade', () => {
    process.env.AWS_ENDPOINT_URL_TIMESTREAM_QUERY = '';
    process.env.AWS_ENDPOINT_URL_TIMESTREAM = '';
    process.env.AWS_ENDPOINT_URL = 'http://global.local';

    const { query } = loadWithStubbedSdk();

    expect(query.endpoint).toBe('http://global.local');
  });

  it('leaves the endpoint undefined when nothing is configured', () => {
    const { query, write } = loadWithStubbedSdk();

    expect(query.endpoint).toBeUndefined();
    expect(write.endpoint).toBeUndefined();
  });

  it('resolves the region from AWS_REGION, then AWS_DEFAULT_REGION', () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'sa-east-1';

    expect(loadWithStubbedSdk().query.region).toBe('us-east-1');

    jest.resetModules();
    process.env.AWS_REGION = '';

    expect(loadWithStubbedSdk().query.region).toBe('sa-east-1');
  });
});
