/**
 * Builders that turn a short description into a **complete** API Gateway proxy event, in
 * payload format 1.0 ({@link createMockEventV1}), 2.0 ({@link createMockEventV2}) or both
 * at once ({@link createMockFetch}).
 *
 * Writing those events by hand is tedious and error prone: `multiValueHeaders`,
 * `multiValueQueryStringParameters`, `requestContext.identity`, `rawQueryString`, `routeKey`
 * and `resource` all have to stay consistent with the method, the path and the query, and a
 * handler that reads a field the fixture forgot fails for the wrong reason. These builders
 * derive every one of those fields from `{ method, path, pathParameters, query, headers, body }`.
 *
 * Both formats come from the **same** description, which is what makes it possible to run one
 * handler against the REST API (1.0) and the HTTP API (2.0) payload and assert it behaves
 * identically — the v1/v2 parity awpaki supports since 1.4.0.
 *
 * The builders are deterministic: no environment variable is read, no random value is
 * generated, and the only clock read is the default of `requestTimeEpoch` (overridable), so two
 * events built from the same description can be compared with `toEqual`.
 *
 * @module testing/create-mock-event
 */

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayEventDefaultAuthorizerContext,
} from 'aws-lambda';

/** AWS account id stamped on every mock event unless `accountId` overrides it. */
export const MOCK_ACCOUNT_ID = '123456789012';

/** API id stamped on every mock event unless `apiId` overrides it. */
export const MOCK_API_ID = 'mock1api2z';

/** Region used to build `requestContext.domainName`. Never read from the environment. */
export const MOCK_REGION = 'us-east-1';

/** Deployment stage used unless `stage` overrides it. */
export const MOCK_STAGE = 'dev';

/** Request id used unless `requestId` overrides it. Fixed, so assertions stay stable. */
export const MOCK_REQUEST_ID = '00000000-0000-4000-8000-000000000000';

/** Value of `requestContext.extendedRequestId`. */
export const MOCK_EXTENDED_REQUEST_ID = 'mock-extended-request-id';

/** Value of `requestContext.resourceId` (payload 1.0 only). */
export const MOCK_RESOURCE_ID = 'mockrs';

/** Caller IP used unless `sourceIp` overrides it. */
export const MOCK_SOURCE_IP = '127.0.0.1';

/** User agent used when neither `userAgent` nor a `user-agent` header is provided. */
export const MOCK_USER_AGENT = 'awpaki-mock';

/** Primitive accepted wherever API Gateway carries a string. Coerced with `String()`. */
export type MockValue = string | number | boolean;

/** A single value, or a repeated one (multi-value header / query string parameter). */
export type MockMultiValue = MockValue | MockValue[];

/**
 * Short description of an HTTP call, expanded into a full event by the builders below.
 *
 * Only `method` and `path` are conceptually needed; everything else has a documented
 * default. The fields after `body` exist so a test can pin the values it asserts on.
 */
export interface MockEventDescription {
  /** HTTP method. Case insensitive, always upper cased in the event. Defaults to `GET`. */
  method?: string;
  /**
   * Route path, optionally templated: `/users/:id` and `/users/{id}` are equivalent and both
   * produce `resource` / `routeKey` `/users/{id}`. A leading slash is added when missing.
   * Must not contain a query string — use `query` instead.
   */
  path?: string;
  /**
   * Path parameter values. Every `:name` / `{name}` segment of `path` must have an entry here,
   * otherwise the builder throws. Extra entries are still reflected in the event.
   */
  pathParameters?: Record<string, MockValue>;
  /** Query string parameters. An array value becomes a repeated parameter. */
  query?: Record<string, MockMultiValue>;
  /** Request headers. An array value becomes a repeated header. */
  headers?: Record<string, MockMultiValue>;
  /**
   * Request body. A string is used verbatim; anything else is `JSON.stringify`d;
   * `undefined` and `null` mean "no body".
   */
  body?: unknown;
  /**
   * Cookies. In 1.0 they become a single `Cookie` header; in 2.0 they become the `cookies`
   * array and the cookie header is dropped, exactly like API Gateway does.
   * When omitted, a cookie header present in `headers` is parsed into the 2.0 array.
   */
  cookies?: string[];
  /** Deployment stage. Defaults to {@link MOCK_STAGE}. */
  stage?: string;
  /** API id. Defaults to {@link MOCK_API_ID}. */
  apiId?: string;
  /** AWS account id. Defaults to {@link MOCK_ACCOUNT_ID}. */
  accountId?: string;
  /** Request id. Defaults to {@link MOCK_REQUEST_ID}. */
  requestId?: string;
  /** Epoch milliseconds of the request. Defaults to `Date.now()`. */
  requestTimeEpoch?: number;
  /** Caller IP. Defaults to {@link MOCK_SOURCE_IP}. */
  sourceIp?: string;
  /** User agent. Defaults to the `user-agent` header, then to {@link MOCK_USER_AGENT}. */
  userAgent?: string;
  /** Whether `body` is base64 encoded. Defaults to `false`. */
  isBase64Encoded?: boolean;
  /** Stage variables. Defaults to `null` in 1.0 and to absent in 2.0. */
  stageVariables?: Record<string, MockValue>;
  /**
   * Authorizer context. Lands on `requestContext.authorizer` in both formats — `null` in 1.0
   * when omitted (the shape API Gateway sends without an authorizer), absent in 2.0.
   */
  authorizer?: APIGatewayEventDefaultAuthorizerContext;
}

/** The same described call in both payload formats, as returned by {@link createMockFetch}. */
export interface MockFetch {
  /** REST API / payload format 1.0 event. */
  v1: APIGatewayProxyEvent;
  /** HTTP API / payload format 2.0 event. */
  v2: APIGatewayProxyEventV2;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const COOKIE_HEADER = 'cookie';

/**
 * Formats an epoch in the CLF-like layout API Gateway uses for `requestContext.requestTime`
 * (1.0) and `requestContext.time` (2.0), always in UTC.
 *
 * @param epoch - Epoch in milliseconds
 * @returns Formatted timestamp, e.g. `08/Aug/2026:12:30:00 +0000`
 */
function toRequestTime(epoch: number): string {
  const date = new Date(epoch);
  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${pad(date.getUTCDate())}/${MONTHS[date.getUTCMonth()]}/${date.getUTCFullYear()}:` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
  );
}

/**
 * Returns the parameter name of a path segment, for both the `:name` and the `{name}` forms.
 *
 * @param segment - Single path segment, without slashes
 * @returns Parameter name, or undefined when the segment is a literal
 */
function parameterName(segment: string): string | undefined {
  if (segment.startsWith(':') && segment.length > 1) return segment.slice(1);
  if (segment.startsWith('{') && segment.endsWith('}') && segment.length > 2) {
    return segment.slice(1, -1);
  }
  return undefined;
}

/** Route derived from the described path and its parameters. */
interface ResolvedRoute {
  /** Route template in API Gateway form, e.g. `/users/{id}` */
  template: string;
  /** Concrete path with every parameter replaced, e.g. `/users/42` */
  path: string;
  /** Path parameters coerced to strings */
  pathParameters: Record<string, string>;
}

/**
 * Resolves the route template and the concrete path from a possibly templated path.
 *
 * @param rawPath - Path as described, templated or not
 * @param pathParameters - Values for the templated segments
 * @returns Template, concrete path and stringified parameters
 * @throws TypeError when the path carries a query string, or when a templated segment has no
 *         matching entry in `pathParameters`
 */
function resolveRoute(
  rawPath: string,
  pathParameters: Record<string, MockValue> | undefined
): ResolvedRoute {
  if (rawPath.includes('?')) {
    throw new TypeError(
      `createMockEvent: path "${rawPath}" must not contain a query string, use the "query" field`
    );
  }

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(pathParameters ?? {})) {
    params[key] = String(value);
  }

  const segments = (rawPath.startsWith('/') ? rawPath : `/${rawPath}`).split('/');
  const templateSegments: string[] = [];
  const pathSegments: string[] = [];

  for (const segment of segments) {
    const name = parameterName(segment);

    if (name === undefined) {
      templateSegments.push(segment);
      pathSegments.push(segment);
      continue;
    }

    if (!(name in params)) {
      throw new TypeError(
        `createMockEvent: path "${rawPath}" declares the parameter "${name}" but pathParameters has no "${name}" entry`
      );
    }

    templateSegments.push(`{${name}}`);
    pathSegments.push(params[name]);
  }

  return {
    template: templateSegments.join('/'),
    path: pathSegments.join('/'),
    pathParameters: params,
  };
}

/**
 * Normalizes a described map into `{ key: string[] }`, preserving key case and insertion order.
 * `undefined` and `null` values are dropped instead of being stringified.
 *
 * @param input - Described headers or query string parameters
 * @returns Multi-value map with every value coerced to string
 */
function toMultiMap(input: Record<string, MockMultiValue> | undefined): Record<string, string[]> {
  const output: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined || value === null) continue;
    output[key] = (Array.isArray(value) ? value : [value]).map(String);
  }

  return output;
}

/**
 * Collapses a multi-value map keeping the **last** value of each key — the rule API Gateway
 * applies to `headers` and `queryStringParameters` in payload format 1.0.
 *
 * @param multi - Multi-value map
 * @returns Single-value map
 */
function lastValues(multi: Record<string, string[]>): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, values] of Object.entries(multi)) {
    output[key] = values[values.length - 1];
  }

  return output;
}

/**
 * Collapses a multi-value map joining repeated values with a comma — the rule API Gateway
 * applies to `headers` and `queryStringParameters` in payload format 2.0.
 *
 * @param multi - Multi-value map
 * @param lowercaseKeys - Whether keys should be lower cased (true for 2.0 headers)
 * @returns Single-value map with comma-joined values
 */
function joinValues(
  multi: Record<string, string[]>,
  lowercaseKeys = false
): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, values] of Object.entries(multi)) {
    output[lowercaseKeys ? key.toLowerCase() : key] = values.join(',');
  }

  return output;
}

/**
 * Builds the percent-encoded query string, repeating keys that carry several values.
 *
 * @param multi - Multi-value query string map
 * @returns Encoded query string without the leading `?`, empty when there is no parameter
 */
function toRawQueryString(multi: Record<string, string[]>): string {
  const parts: string[] = [];

  for (const [key, values] of Object.entries(multi)) {
    for (const value of values) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }

  return parts.join('&');
}

/**
 * Removes every cookie header from a multi-value map, whatever its casing.
 *
 * @param multi - Multi-value header map, mutated in place
 * @returns Values of the removed cookie headers
 */
function takeCookieHeaders(multi: Record<string, string[]>): string[] {
  const taken: string[] = [];

  for (const key of Object.keys(multi)) {
    if (key.toLowerCase() === COOKIE_HEADER) {
      taken.push(...multi[key]);
      delete multi[key];
    }
  }

  return taken;
}

/**
 * Reads a header value regardless of the casing used in the description.
 *
 * @param multi - Multi-value header map
 * @param name - Header name, matched case insensitively
 * @returns Last value of the header, or undefined when absent
 */
function findHeader(multi: Record<string, string[]>, name: string): string | undefined {
  const key = Object.keys(multi).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase()
  );
  if (key === undefined) return undefined;

  const values = multi[key];
  return values[values.length - 1];
}

/**
 * Serializes the described body the way API Gateway delivers it.
 *
 * @param body - Described body
 * @returns The body as a string, or null when there is none
 */
function toBody(body: unknown): string | null {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  return JSON.stringify(body) ?? null;
}

/**
 * Coerces the described stage variables to strings.
 *
 * @param stageVariables - Described stage variables
 * @returns Stringified map, or undefined when nothing was described
 */
function toStageVariables(
  stageVariables: Record<string, MockValue> | undefined
): Record<string, string> | undefined {
  if (!stageVariables) return undefined;

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(stageVariables)) {
    output[key] = String(value);
  }

  return output;
}

/**
 * Builds a complete API Gateway **payload format 1.0** event (`APIGatewayProxyEvent`), the
 * shape REST APIs and `logApiGatewayEvent` expect.
 *
 * Derived from the description: `resource` (route template), `path` (interpolated),
 * `multiValueHeaders`, `multiValueQueryStringParameters` (single-value maps keep the *last*
 * value of each key, as API Gateway does), and a full `requestContext` with
 * `identity.sourceIp` / `identity.userAgent`, `stage`, `requestId`, `apiId`, `requestTime`,
 * `requestTimeEpoch`, `resourcePath` and a stage-prefixed `path`.
 *
 * @param description - Short description of the call
 * @returns Fully populated payload format 1.0 event
 * @throws TypeError when `path` carries a query string or a templated segment has no value
 *
 * @example
 * ```typescript
 * const event = createMockEventV1({
 *   method: 'post',
 *   path: '/users/:id/orders',
 *   pathParameters: { id: '42' },
 *   query: { include: ['items', 'totals'] },
 *   headers: { Authorization: 'Bearer token' },
 *   body: { productId: 'p-1' },
 * });
 *
 * event.httpMethod;                          // 'POST'
 * event.path;                                // '/users/42/orders'
 * event.resource;                            // '/users/{id}/orders'
 * event.queryStringParameters;               // { include: 'totals' }
 * event.multiValueQueryStringParameters;     // { include: ['items', 'totals'] }
 * event.body;                                // '{"productId":"p-1"}'
 * ```
 */
export function createMockEventV1(description: MockEventDescription = {}): APIGatewayProxyEvent {
  const route = resolveRoute(description.path ?? '/', description.pathParameters);
  const method = (description.method ?? 'GET').toUpperCase();
  const stage = description.stage ?? MOCK_STAGE;
  const requestTimeEpoch = description.requestTimeEpoch ?? Date.now();

  const multiValueHeaders = toMultiMap(description.headers);
  const userAgent =
    description.userAgent ?? findHeader(multiValueHeaders, 'user-agent') ?? MOCK_USER_AGENT;

  if (description.cookies) {
    takeCookieHeaders(multiValueHeaders);
    if (description.cookies.length > 0) {
      multiValueHeaders.Cookie = [description.cookies.join('; ')];
    }
  }

  const multiValueQueryStringParameters = toMultiMap(description.query);
  const hasQuery = Object.keys(multiValueQueryStringParameters).length > 0;
  const hasPathParameters = Object.keys(route.pathParameters).length > 0;
  const stageVariables = toStageVariables(description.stageVariables);

  return {
    resource: route.template,
    path: route.path,
    httpMethod: method,
    headers: lastValues(multiValueHeaders),
    multiValueHeaders,
    queryStringParameters: hasQuery ? lastValues(multiValueQueryStringParameters) : null,
    multiValueQueryStringParameters: hasQuery ? multiValueQueryStringParameters : null,
    pathParameters: hasPathParameters ? route.pathParameters : null,
    stageVariables: stageVariables ?? null,
    body: toBody(description.body),
    isBase64Encoded: description.isBase64Encoded ?? false,
    requestContext: {
      accountId: description.accountId ?? MOCK_ACCOUNT_ID,
      apiId: description.apiId ?? MOCK_API_ID,
      authorizer: description.authorizer ?? null,
      domainName: `${description.apiId ?? MOCK_API_ID}.execute-api.${MOCK_REGION}.amazonaws.com`,
      domainPrefix: description.apiId ?? MOCK_API_ID,
      extendedRequestId: MOCK_EXTENDED_REQUEST_ID,
      httpMethod: method,
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
        sourceIp: description.sourceIp ?? MOCK_SOURCE_IP,
        user: null,
        userAgent,
        userArn: null,
      },
      path: `/${stage}${route.path}`,
      protocol: 'HTTP/1.1',
      requestId: description.requestId ?? MOCK_REQUEST_ID,
      requestTime: toRequestTime(requestTimeEpoch),
      requestTimeEpoch,
      resourceId: MOCK_RESOURCE_ID,
      resourcePath: route.template,
      stage,
    },
  };
}

/**
 * Builds a complete API Gateway **payload format 2.0** event (`APIGatewayProxyEventV2`), the
 * shape HTTP APIs and `logApiGatewayEventV2` expect.
 *
 * Derived from the description: `routeKey` (`METHOD /template`), `rawPath` (interpolated),
 * `rawQueryString`, `version` `'2.0'`, lower cased headers with repeated values joined by a
 * comma (as API Gateway does), `cookies` extracted out of the headers, and a `requestContext`
 * carrying `http.{ method, path, protocol, sourceIp, userAgent }`, `stage`, `requestId`,
 * `apiId`, `time` and `timeEpoch`. Fields API Gateway omits when empty
 * (`queryStringParameters`, `pathParameters`, `cookies`, `body`, `stageVariables`) are left
 * out instead of being set to `null`.
 *
 * @param description - Short description of the call
 * @returns Fully populated payload format 2.0 event
 * @throws TypeError when `path` carries a query string or a templated segment has no value
 *
 * @example
 * ```typescript
 * const event = createMockEventV2({
 *   method: 'get',
 *   path: '/users/:id',
 *   pathParameters: { id: '42' },
 *   query: { fields: ['name', 'email'] },
 *   cookies: ['session=abc'],
 * });
 *
 * event.version;                       // '2.0'
 * event.routeKey;                      // 'GET /users/{id}'
 * event.rawPath;                       // '/users/42'
 * event.rawQueryString;                // 'fields=name&fields=email'
 * event.queryStringParameters;         // { fields: 'name,email' }
 * event.cookies;                       // ['session=abc']
 * event.requestContext.http.method;    // 'GET'
 * ```
 */
export function createMockEventV2(description: MockEventDescription = {}): APIGatewayProxyEventV2 {
  const route = resolveRoute(description.path ?? '/', description.pathParameters);
  const method = (description.method ?? 'GET').toUpperCase();
  const stage = description.stage ?? MOCK_STAGE;
  const apiId = description.apiId ?? MOCK_API_ID;
  const timeEpoch = description.requestTimeEpoch ?? Date.now();

  const multiValueHeaders = toMultiMap(description.headers);
  const userAgent =
    description.userAgent ?? findHeader(multiValueHeaders, 'user-agent') ?? MOCK_USER_AGENT;

  // Payload 2.0 never carries cookies in `headers`: they travel in the `cookies` array.
  const cookieHeaders = takeCookieHeaders(multiValueHeaders);
  const cookies = description.cookies
    ? [...description.cookies]
    : cookieHeaders
        .flatMap((header) => header.split(';'))
        .map((cookie) => cookie.trim())
        .filter((cookie) => cookie.length > 0);

  const multiValueQuery = toMultiMap(description.query);
  const stageVariables = toStageVariables(description.stageVariables);

  const requestContext = {
    accountId: description.accountId ?? MOCK_ACCOUNT_ID,
    apiId,
    domainName: `${apiId}.execute-api.${MOCK_REGION}.amazonaws.com`,
    domainPrefix: apiId,
    http: {
      method,
      path: route.path,
      protocol: 'HTTP/1.1',
      sourceIp: description.sourceIp ?? MOCK_SOURCE_IP,
      userAgent,
    },
    requestId: description.requestId ?? MOCK_REQUEST_ID,
    routeKey: `${method} ${route.template}`,
    stage,
    time: toRequestTime(timeEpoch),
    timeEpoch,
    ...(description.authorizer !== undefined ? { authorizer: description.authorizer } : {}),
  };

  const event: APIGatewayProxyEventV2 = {
    version: '2.0',
    routeKey: `${method} ${route.template}`,
    rawPath: route.path,
    rawQueryString: toRawQueryString(multiValueQuery),
    headers: joinValues(multiValueHeaders, true),
    isBase64Encoded: description.isBase64Encoded ?? false,
    requestContext,
  };

  if (cookies.length > 0) event.cookies = cookies;
  if (Object.keys(multiValueQuery).length > 0) {
    event.queryStringParameters = joinValues(multiValueQuery);
  }
  if (Object.keys(route.pathParameters).length > 0) {
    event.pathParameters = route.pathParameters;
  }
  if (stageVariables) event.stageVariables = stageVariables;

  const body = toBody(description.body);
  if (body !== null) event.body = body;

  return event;
}

/**
 * Builds the **same** described call in both payload formats at once.
 *
 * This is the entry point for parity tests: feed `v1` and `v2` to the same handler and assert
 * the response is identical. The two events are independent objects — mutating one never
 * affects the other — and they share the resolved `requestTimeEpoch`, so
 * `v1.requestContext.requestTimeEpoch === v2.requestContext.timeEpoch` even when the default
 * clock is used.
 *
 * @param description - Short description of the call
 * @returns Both events, under `v1` and `v2`
 * @throws TypeError when `path` carries a query string or a templated segment has no value
 *
 * @example
 * ```typescript
 * const { v1, v2 } = createMockFetch({ method: 'GET', path: '/users/:id', pathParameters: { id: '42' } });
 * const context = createMockContext();
 *
 * expect(await handlerV1(v1, context)).toEqual(await handlerV2(v2, context));
 * ```
 */
export function createMockFetch(description: MockEventDescription = {}): MockFetch {
  const shared: MockEventDescription = {
    ...description,
    requestTimeEpoch: description.requestTimeEpoch ?? Date.now(),
  };

  return {
    v1: createMockEventV1(shared),
    v2: createMockEventV2(shared),
  };
}
