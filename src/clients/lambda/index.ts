import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { InvokeCommandOutput } from '@aws-sdk/client-lambda';
// `aws-lambda` ships types only and does not exist at runtime, so the import must be
// erased at compile time — `import type` guarantees it.
import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import retry from 'async-retry';
import { randomUUID } from 'node:crypto';
import { defaultRetryOptions } from '../../constants/default-retry-options';
import { resolveEndpoint, resolveRegion, resolveStage } from '../../environment';
import { BadGateway, BadRequest, createHttpError } from '../../errors';
import { getLogger, toErrorLog } from '../../loggers/logger';
import type { RetryOptions } from '../index.types';

// Region and endpoint are resolved once, at module load, and kept in module scope so the
// ephemeral cross-account clients built by `invokeLambda` reuse exactly the same values as
// the shared client below instead of resolving the environment again per call.
const region = resolveRegion();
const endpoint = resolveEndpoint('AWS_ENDPOINT_URL_LAMBDA');

// Initialize Lambda client from environment variables
const client = new LambdaClient({
  region,
  endpoint,
});

/**
 * Payload format of the synthetic API Gateway event built by {@link lambdaClient.invokeLambda}.
 *
 * - `rest` — REST API / payload format 1.0 (`multiValueHeaders`, `httpMethod`, `path`).
 * - `httpApiV2` — HTTP API / payload format 2.0 (`routeKey`, `rawPath`, `requestContext.http`).
 */
export type LambdaEventFormat = 'rest' | 'httpApiV2';

/**
 * Static AWS credentials used to invoke a function in another account.
 *
 * Structurally identical to what `secretsManagerClient.getCredentialsFromSecret()` returns,
 * so the two compose without any adapter.
 */
export interface LambdaInvokeCredentials {
  /** AWS access key id */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Session token, required for temporary (STS) credentials */
  sessionToken?: string;
  /** Optional expiration of temporary credentials */
  expiration?: Date;
}

/**
 * Scalar accepted as a header or query string value before normalization.
 */
export type HeaderValue = string | number | boolean;

/**
 * Header / query string map accepted by {@link InvokeLambdaOptions}. A single value or an
 * array of values may be given per key; everything is coerced to string.
 */
export type MultiValueInput = Record<string, HeaderValue | HeaderValue[] | null | undefined>;

/**
 * Options for {@link lambdaClient.invokeLambda}.
 */
export interface InvokeLambdaOptions {
  /** Name, ARN or partial ARN of the function to invoke */
  functionName: string;
  /** Request path, defaults to `/` (a leading slash is added when missing) */
  path?: string;
  /** HTTP method, defaults to `GET` (always uppercased) */
  httpMethod?: string;
  /** Request body. Strings are sent as-is; anything else is JSON stringified */
  body?: unknown;
  /** Request headers, single or multi value */
  headers?: MultiValueInput;
  /** Query string parameters, single or multi value */
  queryStringParameters?: MultiValueInput;
  /** Path parameters matching the `resource` template */
  pathParameters?: Record<string, HeaderValue | null | undefined>;
  /** Stage variables */
  stageVariables?: Record<string, HeaderValue | null | undefined>;
  /** Authorizer context placed in `requestContext.authorizer` (Cognito claims, custom context, ...) */
  authorizer?: Record<string, any> | null;
  /** Cookies, `httpApiV2` only */
  cookies?: string[];
  /** Payload format of the synthetic event, defaults to `rest` */
  eventFormat?: LambdaEventFormat;
  /** Stage name, defaults to `resolveStage()` */
  stage?: string;
  /** Resource template (`/users/{id}`), defaults to `path` */
  resource?: string;
  /** Route key, `httpApiV2` only. Defaults to `<METHOD> <resource>` */
  routeKey?: string;
  /** Marks the body as base64 encoded, defaults to false */
  isBase64Encoded?: boolean;
  /** Lambda invocation type, defaults to `RequestResponse` */
  invocationType?: 'RequestResponse' | 'Event' | 'DryRun';
  /** Version or alias to invoke */
  qualifier?: string;
  /** Region override — creates an ephemeral client for this call */
  region?: string;
  /** Cross-account credentials — creates an ephemeral client for this call */
  credentials?: LambdaInvokeCredentials;
  /** Throws an {@link HttpError} when the decoded envelope carries a status >= 400, defaults to false */
  throwOnErrorStatus?: boolean;
  /** Retry configuration for the `Invoke` call itself */
  retryOptions?: RetryOptions;
}

/**
 * Decoded result of {@link lambdaClient.invokeLambda}.
 *
 * @typeParam T - Expected type of the decoded body
 */
export interface InvokeLambdaResult<T = any> {
  /** `statusCode` of the API Gateway envelope, when the invoked function returned one */
  statusCode?: number;
  /** `headers` of the API Gateway envelope, when present */
  headers?: Record<string, any>;
  /**
   * Decoded body: the parsed `body` of the envelope, the raw body string when it is not
   * JSON, the whole envelope when the function did not return one, or `undefined` for an
   * empty payload (asynchronous invocations).
   */
  body: T;
  /** Parsed envelope, or the raw text when the payload is not JSON */
  payload: unknown;
  /** Payload decoded to utf-8, exactly as returned by Lambda */
  rawPayload: string;
  /** Status code of the `Invoke` API call itself (200 / 202 / 204) */
  invocationStatusCode?: number;
  /** Version of the function that ran */
  executedVersion?: string;
}

const SYNTHETIC_ACCOUNT_ID = '000000000000';
const SYNTHETIC_API_ID = 'awpaki-invoke';
const SYNTHETIC_DOMAIN_NAME = 'awpaki-invoke.lambda.local';
const SYNTHETIC_RESOURCE_ID = 'awpaki';
const SYNTHETIC_SOURCE_IP = '127.0.0.1';
const SYNTHETIC_USER_AGENT = 'awpaki/invokeLambda';
const SYNTHETIC_PROTOCOL = 'HTTP/1.1';

/** Header carrying the name of the function that issued the invoke */
const SOURCE_LAMBDA_HEADER = 'x-source-lambda';
/** Header propagating the active X-Ray trace */
const TRACE_ID_HEADER = 'x-trace-id';

const CLF_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats a date the way API Gateway stamps `requestTime` / `time` (CLF, always UTC).
 *
 * @param date - Date to format
 * @returns Date in the `dd/MMM/yyyy:HH:mm:ss +0000` format
 */
function formatClfTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${pad(date.getUTCDate())}/${CLF_MONTHS[date.getUTCMonth()]}/${date.getUTCFullYear()}:` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
  );
}

/**
 * Checks whether a value is a plain (non-array, non-null) object.
 *
 * @param value - Value to inspect
 * @returns True when the value can be read as a record
 */
function isPlainRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes a header/query map into the multi value shape API Gateway uses, dropping
 * `null`/`undefined` entries and coercing every remaining value to string.
 *
 * @param input - Single or multi value map provided by the caller
 * @returns Map of key to array of string values
 */
function normalizeMultiValue(input?: MultiValueInput): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};

  if (!input) return normalized;

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;

    const values = (Array.isArray(value) ? value : [value])
      .filter((item) => item !== undefined && item !== null)
      .map((item) => String(item));

    if (values.length > 0) {
      normalized[key] = values;
    }
  }

  return normalized;
}

/**
 * Collapses a multi value map keeping the **last** value of each key — what API Gateway
 * puts in the single value `headers` / `queryStringParameters` of a v1 event.
 *
 * @param multiValue - Normalized multi value map
 * @returns Map of key to a single string value
 */
function lastValueOf(multiValue: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(multiValue).map(([key, values]) => [key, values[values.length - 1]])
  );
}

/**
 * Collapses a multi value map joining the values — what a payload format 2.0 event carries.
 *
 * @param multiValue - Normalized multi value map
 * @param separator - Separator used to join the values
 * @returns Map of key to a single joined string value
 */
function joinValuesOf(
  multiValue: Record<string, string[]>,
  separator: string
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(multiValue).map(([key, values]) => [key, values.join(separator)])
  );
}

/**
 * Coerces a record of scalars into a record of strings, dropping empty entries.
 *
 * @param input - Record provided by the caller
 * @returns Record of string values
 */
function toStringRecord(
  input?: Record<string, HeaderValue | null | undefined>
): Record<string, string> {
  const record: Record<string, string> = {};

  if (!input) return record;

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    record[key] = String(value);
  }

  return record;
}

/**
 * Case insensitive header lookup.
 *
 * @param headers - Normalized multi value headers
 * @param name - Lowercase header name to look for
 * @returns True when the header is already present
 */
function hasHeader(headers: Record<string, string[]>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

/**
 * Everything both event formats need, computed once.
 */
interface PreparedRequest {
  path: string;
  resource: string;
  httpMethod: string;
  stage: string;
  headers: Record<string, string[]>;
  queryStringParameters: Record<string, string[]>;
  body: string | null;
  isBase64Encoded: boolean;
  requestId: string;
  now: Date;
}

/**
 * Normalizes the caller options into the pieces shared by the v1 and v2 events, injecting
 * the observability headers (`x-source-lambda`, `x-trace-id`) read from the Lambda runtime
 * environment. Caller supplied headers win over the injected ones.
 *
 * @param options - Options given to {@link lambdaClient.invokeLambda}
 * @returns Normalized request pieces
 */
function prepareRequest(options: InvokeLambdaOptions): PreparedRequest {
  const rawPath = options.path ?? '/';
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const httpMethod = (options.httpMethod ?? 'GET').toUpperCase();
  const body =
    options.body === undefined || options.body === null
      ? null
      : typeof options.body === 'string'
        ? options.body
        : (JSON.stringify(options.body) ?? null);

  // Observability first so an explicit caller header of the same name overrides it.
  const observability: Record<string, string[]> = {};
  const sourceLambda = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const traceId = process.env._X_AMZN_TRACE_ID;

  if (sourceLambda) observability[SOURCE_LAMBDA_HEADER] = [sourceLambda];
  if (traceId) observability[TRACE_ID_HEADER] = [traceId];

  const headers = { ...observability, ...normalizeMultiValue(options.headers) };

  // Only guessed when the body was serialized by us: a caller passing a raw string owns
  // its content type.
  if (body !== null && typeof options.body !== 'string' && !hasHeader(headers, 'content-type')) {
    headers['content-type'] = ['application/json'];
  }

  return {
    path,
    resource: options.resource ?? path,
    httpMethod,
    stage: options.stage ?? resolveStage(),
    headers,
    queryStringParameters: normalizeMultiValue(options.queryStringParameters),
    body,
    isBase64Encoded: options.isBase64Encoded ?? false,
    requestId: randomUUID(),
    now: new Date(),
  };
}

/**
 * Builds a REST API (payload format 1.0) proxy event.
 *
 * @param options - Options given to {@link lambdaClient.invokeLambda}
 * @param request - Normalized request pieces
 * @returns Synthetic `APIGatewayProxyEvent`
 */
function buildRestEvent(
  options: InvokeLambdaOptions,
  request: PreparedRequest
): APIGatewayProxyEvent {
  const pathParameters = toStringRecord(options.pathParameters);
  const stageVariables = toStringRecord(options.stageVariables);
  const hasQuery = Object.keys(request.queryStringParameters).length > 0;

  return {
    body: request.body,
    headers: lastValueOf(request.headers),
    multiValueHeaders: request.headers,
    httpMethod: request.httpMethod,
    isBase64Encoded: request.isBase64Encoded,
    path: request.path,
    pathParameters: Object.keys(pathParameters).length > 0 ? pathParameters : null,
    queryStringParameters: hasQuery ? lastValueOf(request.queryStringParameters) : null,
    multiValueQueryStringParameters: hasQuery ? request.queryStringParameters : null,
    stageVariables: Object.keys(stageVariables).length > 0 ? stageVariables : null,
    resource: request.resource,
    requestContext: {
      accountId: SYNTHETIC_ACCOUNT_ID,
      apiId: SYNTHETIC_API_ID,
      authorizer: options.authorizer ?? null,
      domainName: SYNTHETIC_DOMAIN_NAME,
      domainPrefix: SYNTHETIC_API_ID,
      extendedRequestId: request.requestId,
      httpMethod: request.httpMethod,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: SYNTHETIC_SOURCE_IP,
        user: null,
        userAgent: SYNTHETIC_USER_AGENT,
        userArn: null,
      },
      path: `/${request.stage}${request.path}`,
      protocol: SYNTHETIC_PROTOCOL,
      requestId: request.requestId,
      requestTime: formatClfTime(request.now),
      requestTimeEpoch: request.now.getTime(),
      resourceId: SYNTHETIC_RESOURCE_ID,
      resourcePath: request.resource,
      stage: request.stage,
    },
  };
}

/**
 * Builds an HTTP API (payload format 2.0) proxy event.
 *
 * @param options - Options given to {@link lambdaClient.invokeLambda}
 * @param request - Normalized request pieces
 * @returns Synthetic `APIGatewayProxyEventV2`
 */
function buildHttpApiV2Event(
  options: InvokeLambdaOptions,
  request: PreparedRequest
): APIGatewayProxyEventV2 {
  const rawQuery = new URLSearchParams();

  for (const [key, values] of Object.entries(request.queryStringParameters)) {
    for (const value of values) {
      rawQuery.append(key, value);
    }
  }

  const pathParameters = toStringRecord(options.pathParameters);
  const stageVariables = toStringRecord(options.stageVariables);
  const queryStringParameters = joinValuesOf(request.queryStringParameters, ',');
  const routeKey = options.routeKey ?? `${request.httpMethod} ${request.resource}`;

  const event: APIGatewayProxyEventV2 = {
    version: '2.0',
    routeKey,
    rawPath: request.path,
    rawQueryString: rawQuery.toString(),
    cookies: options.cookies,
    headers: joinValuesOf(request.headers, ', '),
    queryStringParameters:
      Object.keys(queryStringParameters).length > 0 ? queryStringParameters : undefined,
    pathParameters: Object.keys(pathParameters).length > 0 ? pathParameters : undefined,
    stageVariables: Object.keys(stageVariables).length > 0 ? stageVariables : undefined,
    body: request.body ?? undefined,
    isBase64Encoded: request.isBase64Encoded,
    requestContext: {
      accountId: SYNTHETIC_ACCOUNT_ID,
      apiId: SYNTHETIC_API_ID,
      domainName: SYNTHETIC_DOMAIN_NAME,
      domainPrefix: SYNTHETIC_API_ID,
      http: {
        method: request.httpMethod,
        path: request.path,
        protocol: SYNTHETIC_PROTOCOL,
        sourceIp: SYNTHETIC_SOURCE_IP,
        userAgent: SYNTHETIC_USER_AGENT,
      },
      requestId: request.requestId,
      routeKey,
      stage: request.stage,
      time: formatClfTime(request.now),
      timeEpoch: request.now.getTime(),
    },
  };

  // `APIGatewayEventRequestContextV2` only models the authorizer through its parameterized
  // variants, so the context is attached here instead of widening the public option type.
  if (options.authorizer) {
    (event.requestContext as unknown as Record<string, unknown>).authorizer = options.authorizer;
  }

  return event;
}

/**
 * Decodes the raw `Payload` returned by Lambda into utf-8 text, never throwing.
 *
 * @param payload - Value of `InvokeCommandOutput.Payload`
 * @returns Payload as text, or an empty string when it cannot be decoded
 */
function payloadToText(payload: unknown): string {
  if (payload === undefined || payload === null) return '';
  if (typeof payload === 'string') return payload;

  try {
    if (payload instanceof Uint8Array) {
      return Buffer.from(payload).toString('utf8');
    }

    const transformToString = (payload as { transformToString?: unknown }).transformToString;
    if (typeof transformToString === 'function') {
      const text = (transformToString as () => unknown).call(payload);
      return typeof text === 'string' ? text : String(text);
    }

    return String(payload);
  } catch {
    return '';
  }
}

/**
 * Parses JSON without throwing.
 *
 * @param text - Text to parse
 * @returns `{ ok: true, value }` on success, `{ ok: false }` otherwise
 */
function safeJsonParse(text: string): { ok: boolean; value?: unknown } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Result of the payload decoding cascade.
 */
interface DecodedPayload {
  statusCode?: number;
  headers?: Record<string, any>;
  body: any;
  payload: unknown;
  rawPayload: string;
}

/**
 * Decodes an invoke payload in cascade — bytes → utf-8 → envelope JSON → body JSON — falling
 * back to the previous (rawer) step whenever one fails, so a plain text or malformed answer
 * is returned to the caller instead of blowing up the invoke.
 *
 * @param payload - Value of `InvokeCommandOutput.Payload`
 * @returns Decoded status, headers, body and the raw text
 */
function decodePayload(payload: unknown): DecodedPayload {
  const rawPayload = payloadToText(payload);

  if (rawPayload.trim() === '') {
    return { body: undefined, payload: undefined, rawPayload };
  }

  const envelope = safeJsonParse(rawPayload);

  // Not JSON at all: the raw text is the most faithful answer available.
  if (!envelope.ok) {
    return { body: rawPayload, payload: rawPayload, rawPayload };
  }

  // JSON, but not an object (array, number, string, ...): there is no envelope to unwrap.
  if (!isPlainRecord(envelope.value)) {
    return { body: envelope.value, payload: envelope.value, rawPayload };
  }

  const record = envelope.value;

  // No `body` key means the function did not answer with an API Gateway envelope.
  if (!('body' in record)) {
    return { body: record, payload: record, rawPayload };
  }

  let body: unknown = record.body;

  if (typeof body === 'string') {
    const parsedBody = safeJsonParse(body);
    if (parsedBody.ok) {
      body = parsedBody.value;
    }
  }

  return {
    statusCode: typeof record.statusCode === 'number' ? record.statusCode : undefined,
    headers: isPlainRecord(record.headers) ? record.headers : undefined,
    body,
    payload: record,
    rawPayload,
  };
}

/**
 * Sends a command through a given Lambda client with automatic retry logic.
 *
 * @param target - Client to send the command through
 * @param command - Lambda command to send
 * @param retryOptions - Optional retry configuration
 * @returns Promise with the command result
 */
async function sendWithRetry<T>(
  target: LambdaClient,
  command: any,
  retryOptions?: RetryOptions
): Promise<T> {
  const options = { ...defaultRetryOptions, ...retryOptions };

  return retry(
    async () => {
      const result = await target.send(command);
      return result as T;
    },
    {
      retries: options.retries,
      minTimeout: options.minTimeout,
      maxTimeout: options.maxTimeout,
    }
  );
}

/**
 * Releases an ephemeral client without ever failing the invoke because of it.
 *
 * @param target - Ephemeral client to destroy, if any
 * @returns Nothing
 */
function destroyEphemeralClient(target?: LambdaClient): void {
  if (!target) return;

  try {
    target.destroy();
  } catch (error) {
    getLogger().debug(toErrorLog(error), 'Failed to destroy the ephemeral Lambda client');
  }
}

/**
 * Lambda client with automatic retry logic
 *
 * @example
 * ```typescript
 * import { lambdaClient } from 'awpaki/clients/lambda';
 * import { InvokeCommand } from '@aws-sdk/client-lambda';
 *
 * const result = await lambdaClient.execute(
 *   new InvokeCommand({
 *     FunctionName: 'my-function',
 *     Payload: JSON.stringify({ key: 'value' }),
 *   })
 * );
 *
 * // With custom retry options
 * const retried = await lambdaClient.execute(
 *   new InvokeCommand({ FunctionName: 'my-function', Payload: '...' }),
 *   { retries: 5 }
 * );
 * ```
 */
export const lambdaClient = {
  /**
   * Executes a Lambda command with automatic retry logic
   *
   * @param command - Lambda command to execute
   * @param retryOptions - Optional retry configuration
   * @returns Promise with the command result
   */
  async execute<T = any>(command: any, retryOptions?: RetryOptions): Promise<T> {
    const options = { ...defaultRetryOptions, ...retryOptions };

    return retry(
      async () => {
        const result = await client.send(command);
        return result as T;
      },
      {
        retries: options.retries,
        minTimeout: options.minTimeout,
        maxTimeout: options.maxTimeout,
      }
    );
  },

  /**
   * Invokes another Lambda with a **well formed synthetic API Gateway event** and decodes
   * the answer.
   *
   * What the raw `Invoke` call leaves to every caller, and this wrapper does once:
   *
   * - **Builds the event** in the right shape: `eventFormat: 'rest'` produces a payload
   *   format 1.0 event (`multiValueHeaders`, `multiValueQueryStringParameters`, `path`,
   *   `httpMethod` and a `requestContext` complete enough for the loggers and extractors of
   *   this library), `eventFormat: 'httpApiV2'` produces a payload format 2.0 event
   *   (`routeKey`, `rawPath`, `rawQueryString`, `requestContext.http`).
   * - **Decodes the answer in cascade** — bytes → utf-8 → envelope JSON → body JSON — with a
   *   fallback at every step, so a plain text or malformed answer is returned as raw text
   *   instead of throwing a parse error.
   * - **Propagates failures**: when Lambda reports `FunctionError` the call throws a
   *   {@link BadGateway} carrying `errorType`/`errorMessage`, instead of returning a
   *   successful result with the error hidden inside the body — the classic hole of the raw
   *   invoke. With `throwOnErrorStatus` the same happens for an envelope status >= 400.
   * - **Supports cross-account** through `credentials`: an ephemeral client is created for
   *   that single call (and destroyed right after), reusing the resolved region/endpoint,
   *   without ever replacing the shared module client.
   * - **Injects observability headers** on every invoke: `x-source-lambda`
   *   (`AWS_LAMBDA_FUNCTION_NAME`) and `x-trace-id` (`_X_AMZN_TRACE_ID`), whenever the
   *   runtime provides them.
   *
   * @typeParam T - Expected type of the decoded body
   * @param options - Invocation options: target function, request shape and decoding behavior
   * @returns Promise with the decoded status, headers, body and raw payload
   * @throws {BadRequest} When `functionName` is missing or empty
   * @throws {BadGateway} When Lambda reports a `FunctionError`
   * @throws {HttpError} When `throwOnErrorStatus` is set and the envelope status is >= 400
   *
   * @example
   * ```typescript
   * import { lambdaClient } from 'awpaki/clients/lambda';
   *
   * const { statusCode, body } = await lambdaClient.invokeLambda<{ id: string }>({
   *   functionName: 'users-service-dev-getUser',
   *   httpMethod: 'GET',
   *   path: '/users/42',
   *   resource: '/users/{id}',
   *   pathParameters: { id: '42' },
   *   headers: { authorization: 'Bearer token' },
   * });
   * ```
   *
   * @example
   * ```typescript
   * // HTTP API (payload format 2.0) with a JSON body
   * await lambdaClient.invokeLambda({
   *   functionName: 'orders-service-dev-createOrder',
   *   eventFormat: 'httpApiV2',
   *   httpMethod: 'POST',
   *   path: '/orders',
   *   body: { sku: 'ABC', quantity: 2 },
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Cross-account, composing with the Secrets Manager client
   * import { secretsManagerClient } from 'awpaki/clients/secretsmanager';
   *
   * const credentials = await secretsManagerClient.getCredentialsFromSecret(
   *   'arn:aws:secretsmanager:us-east-1:111122223333:secret:partner-account'
   * );
   *
   * await lambdaClient.invokeLambda({
   *   functionName: 'arn:aws:lambda:us-east-1:111122223333:function:partner-api',
   *   path: '/ping',
   *   credentials,
   * });
   * ```
   */
  async invokeLambda<T = any>(options: InvokeLambdaOptions): Promise<InvokeLambdaResult<T>> {
    const functionName = options.functionName;

    if (typeof functionName !== 'string' || functionName.trim() === '') {
      throw new BadRequest('invokeLambda requires a non-empty functionName');
    }

    const eventFormat = options.eventFormat ?? 'rest';
    const invocationType = options.invocationType ?? 'RequestResponse';
    const request = prepareRequest(options);
    const event =
      eventFormat === 'httpApiV2'
        ? buildHttpApiV2Event(options, request)
        : buildRestEvent(options, request);

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: invocationType,
      Qualifier: options.qualifier,
      Payload: JSON.stringify(event),
    });

    // Ephemeral client per call: the shared module client keeps serving the default
    // credentials of the running function.
    const ephemeralClient =
      options.credentials || options.region
        ? new LambdaClient({
            region: options.region ?? region,
            endpoint,
            credentials: options.credentials,
          })
        : undefined;

    getLogger().debug(
      {
        functionName,
        eventFormat,
        invocationType,
        httpMethod: request.httpMethod,
        path: request.path,
        requestId: request.requestId,
        crossAccount: Boolean(options.credentials),
      },
      `Invoking lambda ${functionName}`
    );

    const startedAt = Date.now();
    let output: InvokeCommandOutput;

    try {
      output = await sendWithRetry<InvokeCommandOutput>(
        ephemeralClient ?? client,
        command,
        options.retryOptions
      );
    } finally {
      destroyEphemeralClient(ephemeralClient);
    }

    const durationMs = Date.now() - startedAt;
    const decoded = decodePayload(output.Payload);

    // The whole point of the wrapper: an unhandled error inside the invoked function comes
    // back as a 200 with the error in the payload, and must not look like a success here.
    if (output.FunctionError) {
      const detail = isPlainRecord(decoded.body) ? decoded.body : {};
      const errorType =
        typeof detail.errorType === 'string' ? detail.errorType : output.FunctionError;
      const errorMessage =
        typeof detail.errorMessage === 'string'
          ? detail.errorMessage
          : decoded.rawPayload || 'no error message returned';

      getLogger().error(
        {
          functionName,
          functionError: output.FunctionError,
          errorType,
          errorMessage,
          requestId: request.requestId,
          durationMs,
        },
        `Lambda ${functionName} returned a function error`
      );

      throw new BadGateway(`Lambda ${functionName} failed: ${errorType}: ${errorMessage}`, {
        functionName,
        functionError: output.FunctionError,
        errorType,
        errorMessage,
        trace: detail.trace ?? detail.stackTrace,
        rawPayload: decoded.rawPayload,
      });
    }

    getLogger().info(
      {
        functionName,
        eventFormat,
        invocationType,
        httpMethod: request.httpMethod,
        path: request.path,
        requestId: request.requestId,
        statusCode: decoded.statusCode,
        invocationStatusCode: output.StatusCode,
        durationMs,
      },
      `Invoked lambda ${functionName}`
    );

    if (
      options.throwOnErrorStatus &&
      typeof decoded.statusCode === 'number' &&
      decoded.statusCode >= 400
    ) {
      const message =
        (isPlainRecord(decoded.body) && typeof decoded.body.message === 'string'
          ? decoded.body.message
          : undefined) ?? `Lambda ${functionName} answered with status ${decoded.statusCode}`;

      throw createHttpError(decoded.statusCode, message, {
        functionName,
        statusCode: decoded.statusCode,
        body: decoded.body,
      });
    }

    return {
      statusCode: decoded.statusCode,
      headers: decoded.headers,
      body: decoded.body as T,
      payload: decoded.payload,
      rawPayload: decoded.rawPayload,
      invocationStatusCode: output.StatusCode,
      executedVersion: output.ExecutedVersion,
    };
  },
};
