import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { secretsManagerClient } from './index.js';

describe('secretsManagerClient', () => {
  it('should have execute method', () => {
    expect(secretsManagerClient).toHaveProperty('execute');
    expect(typeof secretsManagerClient.execute).toBe('function');
  });

  it('should have getCredentialsFromSecret method', () => {
    expect(secretsManagerClient).toHaveProperty('getCredentialsFromSecret');
    expect(typeof secretsManagerClient.getCredentialsFromSecret).toBe('function');
  });

  it('should execute GetSecretValueCommand without errors in structure', async () => {
    const command = new GetSecretValueCommand({ SecretId: 'test-secret' });

    await expect(secretsManagerClient.execute(command, { retries: 0 })).rejects.toThrow();
  });

  it('should accept custom retry options', async () => {
    const command = new GetSecretValueCommand({ SecretId: 'test-secret' });

    await expect(
      secretsManagerClient.execute(command, { retries: 0, minTimeout: 500, maxTimeout: 2000 })
    ).rejects.toThrow();
  });
});

/* eslint-disable @typescript-eslint/no-require-imports -- the client is built at import time */

interface MockedModule {
  secretsManagerClient: typeof import('./index.js').secretsManagerClient;
  commands: Array<{ input: Record<string, any> }>;
  send: jest.Mock;
  /** Serialized log lines produced during the test */
  logs: string[];
  /** Level control of the freshly required logger copy, since the registry is module state */
  setLogLevel: typeof import('../../loggers/logger.js').setLogLevel;
  resetLogLevel: typeof import('../../loggers/logger.js').resetLogLevel;
}

/**
 * Re-imports the module with the AWS SDK stubbed out, so the commands sent and the answers
 * decoded can be controlled from the test.
 */
function loadWithMockedSdk(): MockedModule {
  const commands: Array<{ input: Record<string, any> }> = [];
  const sendMock = jest.fn();

  jest.doMock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: class {
      public send = sendMock;
      constructor(public config: Record<string, any>) {}
    },
    GetSecretValueCommand: class {
      constructor(public input: Record<string, any>) {
        commands.push(this);
      }
    },
  }));

  // The module under test resolves its logger from the freshly reset registry, so the sink
  // has to be installed on that same copy.
  const logs: string[] = [];
  const logger = require('../../loggers/logger.js') as typeof import('../../loggers/logger.js');
  logger.setLogSink((line) => logs.push(line));

  const mod = require('./index.js') as typeof import('./index.js');

  return {
    secretsManagerClient: mod.secretsManagerClient,
    commands,
    send: sendMock,
    logs,
    setLogLevel: logger.setLogLevel,
    resetLogLevel: logger.resetLogLevel,
  };
}

/**
 * Builds the error the SDK raises when a secret does not exist.
 */
function resourceNotFoundError(): Error {
  const error = new Error("Secrets Manager can't find the specified secret.");
  error.name = 'ResourceNotFoundException';
  return error;
}

describe('secretsManagerClient.getCredentialsFromSecret', () => {
  const originalEnv = process.env;
  let consoleSpies: jest.SpyInstance[] = [];

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    consoleSpies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {})
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) spy.mockRestore();
    jest.dontMock('@aws-sdk/client-secrets-manager');
    process.env = originalEnv;
    jest.resetModules();
  });

  it('returns the credentials in the shape invokeLambda expects', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({
      SecretString: JSON.stringify({
        accessKeyId: 'AKIA-partner',
        secretAccessKey: 'super-secret',
        sessionToken: 'session-token',
      }),
    });

    const credentials = await mod.secretsManagerClient.getCredentialsFromSecret(
      'arn:aws:secretsmanager:us-east-1:111122223333:secret:partner'
    );

    expect(credentials).toEqual({
      accessKeyId: 'AKIA-partner',
      secretAccessKey: 'super-secret',
      sessionToken: 'session-token',
    });
    expect(mod.commands).toHaveLength(1);
    expect(mod.commands[0].input).toEqual({
      SecretId: 'arn:aws:secretsmanager:us-east-1:111122223333:secret:partner',
    });
  });

  it('omits the sessionToken when the secret has none', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({
      SecretString: JSON.stringify({ accessKeyId: 'AKIA', secretAccessKey: 'secret' }),
    });

    const credentials = await mod.secretsManagerClient.getCredentialsFromSecret('partner');

    expect(credentials).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'secret' });
    expect('sessionToken' in credentials).toBe(false);
  });

  it('ignores an empty sessionToken', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({
      SecretString: JSON.stringify({
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        sessionToken: '   ',
      }),
    });

    const credentials = await mod.secretsManagerClient.getCredentialsFromSecret('partner');

    expect(credentials.sessionToken).toBeUndefined();
  });

  it('rejects an empty secret id without touching the SDK', async () => {
    const mod = loadWithMockedSdk();

    await expect(mod.secretsManagerClient.getCredentialsFromSecret('   ')).rejects.toMatchObject({
      name: 'BadRequest',
      statusCode: 400,
    });
    expect(mod.send).not.toHaveBeenCalled();
  });

  it('throws NotFound when the secret does not exist', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockRejectedValue(resourceNotFoundError());

    await expect(
      mod.secretsManagerClient.getCredentialsFromSecret('missing-secret', { retries: 0 })
    ).rejects.toMatchObject({
      name: 'NotFound',
      statusCode: 404,
      message: 'Secret not found: missing-secret',
      data: { secretId: 'missing-secret' },
    });
  });

  it('rethrows any other SDK failure untouched', async () => {
    const mod = loadWithMockedSdk();
    const denied = new Error('AccessDeniedException');
    denied.name = 'AccessDeniedException';
    mod.send.mockRejectedValue(denied);

    await expect(
      mod.secretsManagerClient.getCredentialsFromSecret('partner', { retries: 0 })
    ).rejects.toBe(denied);
  });

  it('throws when the secret has no SecretString', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({ SecretBinary: new Uint8Array([1, 2, 3]) });

    await expect(
      mod.secretsManagerClient.getCredentialsFromSecret('binary-secret')
    ).rejects.toMatchObject({
      name: 'UnprocessableEntity',
      statusCode: 422,
      message: expect.stringContaining('has no SecretString'),
      data: { secretId: 'binary-secret', hasSecretBinary: true },
    });
  });

  it('throws when the SecretString is not valid JSON', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({ SecretString: 'AKIA-not-json' });

    let error: Error = new Error('nothing was thrown');

    try {
      await mod.secretsManagerClient.getCredentialsFromSecret('plain-secret');
    } catch (caught) {
      error = caught as Error;
    }

    expect(error).toMatchObject({
      name: 'UnprocessableEntity',
      statusCode: 422,
      message: 'Secret plain-secret is not valid JSON',
    });
    // The secret value must never leak through the error message
    expect(error.message).not.toContain('AKIA-not-json');
  });

  it('throws when the SecretString is JSON but not an object', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({ SecretString: JSON.stringify(['AKIA', 'secret']) });

    await expect(
      mod.secretsManagerClient.getCredentialsFromSecret('array-secret')
    ).rejects.toMatchObject({
      name: 'UnprocessableEntity',
      statusCode: 422,
      message: 'Secret array-secret is not a JSON object',
    });
  });

  it('throws listing every missing credential field', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({ SecretString: JSON.stringify({ user: 'admin' }) });

    await expect(
      mod.secretsManagerClient.getCredentialsFromSecret('wrong-shape')
    ).rejects.toMatchObject({
      name: 'UnprocessableEntity',
      statusCode: 422,
      message: expect.stringContaining('accessKeyId, secretAccessKey'),
      data: { missingFields: ['accessKeyId', 'secretAccessKey'] },
    });
  });

  it('treats a blank or non string credential field as missing', async () => {
    const mod = loadWithMockedSdk();
    mod.send.mockResolvedValue({
      SecretString: JSON.stringify({ accessKeyId: '  ', secretAccessKey: 42 }),
    });

    await expect(
      mod.secretsManagerClient.getCredentialsFromSecret('blank-fields')
    ).rejects.toMatchObject({
      data: { missingFields: ['accessKeyId', 'secretAccessKey'] },
    });
  });

  it('retries the read according to the retry options', async () => {
    const mod = loadWithMockedSdk();
    // Realistic shape: the SDK reports the error in `name`, and the classifier reads that —
    // never the message, which is prose.
    mod.send
      .mockRejectedValueOnce(
        Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' })
      )
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({ accessKeyId: 'AKIA', secretAccessKey: 'secret' }),
      });

    const credentials = await mod.secretsManagerClient.getCredentialsFromSecret('partner', {
      retries: 2,
      minTimeout: 1,
      maxTimeout: 5,
    });

    expect(credentials.accessKeyId).toBe('AKIA');
    expect(mod.send).toHaveBeenCalledTimes(2);
  });

  it('logs through the awpaki logger, never through console, and never logs the secret', async () => {
    const mod = loadWithMockedSdk();
    // The only record this path emits is DEBUG, which the logger's INFO default drops.
    mod.setLogLevel('debug');

    mod.send.mockResolvedValue({
      SecretString: JSON.stringify({
        accessKeyId: 'AKIA-leak',
        secretAccessKey: 'super-secret',
        sessionToken: 'session-token',
      }),
    });

    await mod.secretsManagerClient.getCredentialsFromSecret('partner');

    const joined = mod.logs.join('\n');

    expect(joined).toContain('partner');
    expect(joined).not.toContain('AKIA-leak');
    expect(joined).not.toContain('super-secret');
    expect(joined).not.toContain('session-token');

    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
