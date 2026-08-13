/* eslint-disable @typescript-eslint/no-require-imports -- the lazy barrel can only be observed through require() */
import type { RetryOptions } from './index.js';

/**
 * Every name the barrel is contractually required to expose. Kept as a literal list on
 * purpose: it is the public surface of `awpaki/clients` and must not drift silently.
 */
const CLIENT_NAMES = [
  'dynamodbClient',
  's3Client',
  'sqsClient',
  'lambdaClient',
  'snsClient',
  'iotClient',
  'openSearchClient',
  'sesClient',
  'cloudWatchClient',
  'apiGatewayClient',
  'secretsManagerClient',
  'timestreamQueryClient',
  'timestreamWriteClient',
];

describe('clients barrel', () => {
  afterEach(() => {
    jest.dontMock('./s3/index.js');
    jest.dontMock('@aws-sdk/client-dynamodb');
    jest.resetModules();
  });

  it('exposes every AWS client, plus the reset seam and nothing else', () => {
    const clients = require('./index.js');

    // `resetAwsClients` is the one non-client export: it drops the cached instances so a test
    // can point them at a local endpoint. It pulls in no AWS SDK, which is the constraint
    // this barrel exists to respect.
    expect(Object.keys(clients).sort()).toEqual([...CLIENT_NAMES, 'resetAwsClients'].sort());
  });

  it('installs each client as an enumerable, lazy getter', () => {
    const clients = require('./index.js');

    for (const name of CLIENT_NAMES) {
      const descriptor = Object.getOwnPropertyDescriptor(clients, name);

      expect(descriptor).toMatchObject({ enumerable: true, configurable: true });
      expect(typeof descriptor?.get).toBe('function');
      expect(descriptor?.value).toBeUndefined();
    }
  });

  it('resolves every client to the export of its own module', () => {
    const clients = require('./index.js');

    expect(clients.dynamodbClient).toBe(require('./dynamodb/index.js').dynamodbClient);
    expect(clients.s3Client).toBe(require('./s3/index.js').s3Client);
    expect(clients.sqsClient).toBe(require('./sqs/index.js').sqsClient);
    expect(clients.lambdaClient).toBe(require('./lambda/index.js').lambdaClient);
    expect(clients.snsClient).toBe(require('./sns/index.js').snsClient);
    expect(clients.iotClient).toBe(require('./iot/index.js').iotClient);
    expect(clients.openSearchClient).toBe(require('./opensearch/index.js').openSearchClient);
    expect(clients.sesClient).toBe(require('./ses/index.js').sesClient);
    expect(clients.cloudWatchClient).toBe(require('./cloudwatch/index.js').cloudWatchClient);
    expect(clients.apiGatewayClient).toBe(require('./apigateway/index.js').apiGatewayClient);
    expect(clients.secretsManagerClient).toBe(
      require('./secretsmanager/index.js').secretsManagerClient
    );
    expect(clients.timestreamQueryClient).toBe(
      require('./timestream/index.js').timestreamQueryClient
    );
    expect(clients.timestreamWriteClient).toBe(
      require('./timestream/index.js').timestreamWriteClient
    );
  });

  it('gives every client an execute method', () => {
    const clients = require('./index.js');

    for (const name of CLIENT_NAMES) {
      expect(typeof clients[name].execute).toBe('function');
    }
  });

  it('keeps the two Timestream clients apart', () => {
    const clients = require('./index.js');

    expect(clients.timestreamQueryClient).not.toBe(clients.timestreamWriteClient);
  });

  it('requires a client module only when the property is read', () => {
    let loads = 0;

    jest.doMock('./s3/index.js', () => {
      loads += 1;
      return { s3Client: { execute: jest.fn() } };
    });

    const clients = require('./index.js');
    expect(loads).toBe(0);

    const first = clients.s3Client;
    expect(loads).toBe(1);

    // Node caches the module, so later reads must not load it again
    expect(clients.s3Client).toBe(first);
    expect(loads).toBe(1);
  });

  it('can be required when an optional AWS SDK is not installed', () => {
    jest.doMock('@aws-sdk/client-dynamodb', () => {
      const error: NodeJS.ErrnoException = new Error(
        "Cannot find module '@aws-sdk/client-dynamodb'"
      );
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    });

    // The whole point of the lazy barrel: requiring it must not touch any SDK
    const clients = require('./index.js');

    expect(Object.keys(clients)).toEqual(expect.arrayContaining(CLIENT_NAMES));
    expect(typeof clients.s3Client.execute).toBe('function');

    // Reading the name must NOT throw: Node's CommonJS -> ESM translator reads every named
    // export while evaluating the module and swallows whatever a getter raises, which would
    // turn the binding into `undefined` and surface the missing peer, much later, as
    // "Cannot read properties of undefined". The getter yields a stand-in instead...
    const stand_in = clients.dynamodbClient;
    expect(stand_in).toBeDefined();

    // ...that fails loudly on first use, naming the package and the direct subpath.
    expect(() => stand_in.execute({})).toThrow('@aws-sdk/client-dynamodb');
    expect(() => stand_in.execute({})).toThrow('awpaki/clients/dynamodb');
  });

  it('lets an unexpected error from a client module propagate untouched', () => {
    // Only a missing optional peer degrades to the stand-in; a genuine bug inside a client
    // must not be silently converted into a "not installed" message.
    jest.doMock('./sqs/index.js', () => {
      throw new TypeError('boom');
    });

    const clients = require('./index.js');

    expect(() => clients.sqsClient).toThrow(TypeError);
    expect(() => clients.sqsClient).toThrow('boom');
  });

  it('keeps exporting the RetryOptions type', () => {
    const options: RetryOptions = { retries: 5, minTimeout: 500, maxTimeout: 2000 };
    const partial: RetryOptions = {};

    expect(options).toEqual({ retries: 5, minTimeout: 500, maxTimeout: 2000 });
    expect(partial).toEqual({});
  });
});
