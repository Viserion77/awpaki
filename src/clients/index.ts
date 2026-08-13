/**
 * Lazy barrel for the AWS clients of the package.
 *
 * Every client module instantiates an AWS SDK client at import time, so a plain
 * `export … from './s3/index.js'` here would force `require('awpaki/clients')` to load the
 * thirteen optional `@aws-sdk/*` peers — and to crash with `MODULE_NOT_FOUND` for anyone
 * who installed only the services they use. Each name below is therefore installed as a
 * getter that requires its module on first access (Node's module cache makes every later
 * access free), so importing this barrel costs nothing and only touching a client whose
 * SDK is missing fails.
 *
 * The exported names and types are exactly the ones of the eager barrel, so consumers of
 * `awpaki/clients` are unaffected.
 *
 * A getter must never *throw*, only the client it returns may. Node's CommonJS -> ESM
 * translator reads the value of every named export while evaluating the module, and it
 * swallows any error a getter raises — the binding would silently become `undefined`, and
 * the missing peer would surface much later as `Cannot read properties of undefined`,
 * naming nothing. So a getter whose `require` fails returns {@link missingPeer} instead:
 * a stand-in that throws an actionable error on first use, identically in CJS and ESM.
 *
 * @example
 * ```typescript
 * // Loads nothing yet
 * import { s3Client } from 'awpaki/clients';
 *
 * // @aws-sdk/client-s3 is required here, on first access
 * await s3Client.execute(command);
 * ```
 */

/* eslint-disable @typescript-eslint/no-require-imports -- the deferred require() is the point of this module */

export type { RetryOptions } from './index.types.js';

// Drops every cached client so the next call rebuilds it from the current environment. Safe
// to re-export eagerly: `lazyClient` imports no AWS SDK, which is the constraint this whole
// barrel exists to respect.
export { resetAwsClients } from './lazyClient.js';

/**
 * Builds the stand-in returned when a client's optional peer is not installed.
 *
 * Every property access throws an error naming the missing package and the subpath to
 * import instead. Symbol access is exempt so that `util.inspect`, `console.log` and
 * friends can still describe the value while debugging.
 *
 * @param sdkPackage - The `@aws-sdk/*` package that could not be resolved
 * @param subpath - The per-service subpath that imports it directly
 * @returns A proxy that fails loudly on use
 */
function missingPeer<T>(sdkPackage: string, subpath: string): T {
  const fail = (): never => {
    throw new Error(
      `awpaki/clients: '${sdkPackage}' is not installed, so this client is unavailable. ` +
        `Run \`npm install ${sdkPackage}\`, or import '${subpath}' directly to get the ` +
        `resolution error at import time instead of on first use.`
    );
  };

  return new Proxy(
    {},
    {
      get: (_target, property) => (typeof property === 'symbol' ? undefined : fail()),
      apply: fail,
    }
  ) as T;
}

/**
 * Resolves a client module, degrading to {@link missingPeer} when its SDK is absent.
 *
 * Only a failure to resolve an optional peer is absorbed; any other error (a genuine bug
 * inside the client module, say) propagates untouched. The package named in the message
 * is the one Node actually failed on, which is not always the headline SDK — the DynamoDB
 * client also needs `@aws-sdk/lib-dynamodb`.
 *
 * @param load - Thunk performing the deferred `require`
 * @param subpath - The per-service subpath that imports the client directly
 * @returns The real client, or a stand-in that throws on use
 */
function lazyClient<T>(load: () => T, subpath: string): T {
  try {
    return load();
  } catch (error) {
    const message = (error as Error | null)?.message ?? '';
    const missing = /Cannot find module '(@aws-sdk\/[^']+)'/.exec(message)?.[1];

    if ((error as NodeJS.ErrnoException | null)?.code !== 'MODULE_NOT_FOUND' || !missing) {
      throw error;
    }
    return missingPeer<T>(missing, subpath);
  }
}

// `export type` is fully erased, so re-exporting the per-client types here costs no
// require() and keeps the lazy loading below intact.
export type {
  LambdaEventFormat,
  LambdaInvokeCredentials,
  HeaderValue,
  MultiValueInput,
  InvokeLambdaOptions,
  InvokeLambdaResult,
} from './lambda/index.js';
export type { SecretAwsCredentials } from './secretsmanager/index.js';

export declare const dynamodbClient: typeof import('./dynamodb/index.js').dynamodbClient;
export declare const s3Client: typeof import('./s3/index.js').s3Client;
export declare const sqsClient: typeof import('./sqs/index.js').sqsClient;
export declare const lambdaClient: typeof import('./lambda/index.js').lambdaClient;
export declare const snsClient: typeof import('./sns/index.js').snsClient;
export declare const iotClient: typeof import('./iot/index.js').iotClient;
export declare const openSearchClient: typeof import('./opensearch/index.js').openSearchClient;
export declare const sesClient: typeof import('./ses/index.js').sesClient;
export declare const cloudWatchClient: typeof import('./cloudwatch/index.js').cloudWatchClient;
export declare const apiGatewayClient: typeof import('./apigateway/index.js').apiGatewayClient;
export declare const secretsManagerClient: typeof import('./secretsmanager/index.js').secretsManagerClient;
export declare const timestreamQueryClient: typeof import('./timestream/index.js').timestreamQueryClient;
export declare const timestreamWriteClient: typeof import('./timestream/index.js').timestreamWriteClient;

// `export declare` emits no runtime binding, so the names are declared here as plain
// `exports.<name>` assignments before being replaced by the getters below. Node's
// CommonJS -> ESM interop discovers named exports by *parsing* the emitted file
// (cjs-module-lexer) and only recognises this form, so dropping these assignments would
// break `import { s3Client } from 'awpaki/clients'` in native ESM.
exports.dynamodbClient = undefined;
exports.s3Client = undefined;
exports.sqsClient = undefined;
exports.lambdaClient = undefined;
exports.snsClient = undefined;
exports.iotClient = undefined;
exports.openSearchClient = undefined;
exports.sesClient = undefined;
exports.cloudWatchClient = undefined;
exports.apiGatewayClient = undefined;
exports.secretsManagerClient = undefined;
exports.timestreamQueryClient = undefined;
exports.timestreamWriteClient = undefined;

// The actual bindings: `require` runs on first access and is cached by Node afterwards.
Object.defineProperties(module.exports, {
  dynamodbClient: {
    enumerable: true,
    configurable: true,
    get: () =>
      lazyClient(() => require('./dynamodb/index.js').dynamodbClient, 'awpaki/clients/dynamodb'),
  },
  s3Client: {
    enumerable: true,
    configurable: true,
    get: () => lazyClient(() => require('./s3/index.js').s3Client, 'awpaki/clients/s3'),
  },
  sqsClient: {
    enumerable: true,
    configurable: true,
    get: () => lazyClient(() => require('./sqs/index.js').sqsClient, 'awpaki/clients/sqs'),
  },
  lambdaClient: {
    enumerable: true,
    configurable: true,
    get: () => lazyClient(() => require('./lambda/index.js').lambdaClient, 'awpaki/clients/lambda'),
  },
  snsClient: {
    enumerable: true,
    configurable: true,
    get: () => lazyClient(() => require('./sns/index.js').snsClient, 'awpaki/clients/sns'),
  },
  iotClient: {
    enumerable: true,
    configurable: true,
    get: () => lazyClient(() => require('./iot/index.js').iotClient, 'awpaki/clients/iot'),
  },
  openSearchClient: {
    enumerable: true,
    configurable: true,
    get: () =>
      lazyClient(
        () => require('./opensearch/index.js').openSearchClient,
        'awpaki/clients/opensearch'
      ),
  },
  sesClient: {
    enumerable: true,
    configurable: true,
    get: () => lazyClient(() => require('./ses/index.js').sesClient, 'awpaki/clients/ses'),
  },
  cloudWatchClient: {
    enumerable: true,
    configurable: true,
    get: () =>
      lazyClient(
        () => require('./cloudwatch/index.js').cloudWatchClient,
        'awpaki/clients/cloudwatch'
      ),
  },
  apiGatewayClient: {
    enumerable: true,
    configurable: true,
    get: () =>
      lazyClient(
        () => require('./apigateway/index.js').apiGatewayClient,
        'awpaki/clients/apigateway'
      ),
  },
  secretsManagerClient: {
    enumerable: true,
    configurable: true,
    get: () =>
      lazyClient(
        () => require('./secretsmanager/index.js').secretsManagerClient,
        'awpaki/clients/secretsmanager'
      ),
  },
  timestreamQueryClient: {
    enumerable: true,
    configurable: true,
    get: () =>
      lazyClient(
        () => require('./timestream/index.js').timestreamQueryClient,
        'awpaki/clients/timestream'
      ),
  },
  timestreamWriteClient: {
    enumerable: true,
    configurable: true,
    get: () =>
      lazyClient(
        () => require('./timestream/index.js').timestreamWriteClient,
        'awpaki/clients/timestream'
      ),
  },
});
