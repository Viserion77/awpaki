import {
  createMockEventV1,
  createMockEventV2,
  createMockFetch,
  MOCK_ACCOUNT_ID,
  MOCK_API_ID,
  MOCK_EXTENDED_REQUEST_ID,
  MOCK_REGION,
  MOCK_REQUEST_ID,
  MOCK_RESOURCE_ID,
  MOCK_SOURCE_IP,
  MOCK_STAGE,
  MOCK_USER_AGENT,
} from './create-mock-event';

/** 08/Aug/2026:12:30:45 +0000 — pinned so timestamps can be asserted. */
const FIXED_EPOCH = Date.UTC(2026, 7, 8, 12, 30, 45);

describe('createMockEventV1', () => {
  it('builds a complete payload 1.0 event from an empty description', () => {
    const event = createMockEventV1({ requestTimeEpoch: FIXED_EPOCH });

    expect(event).toEqual({
      resource: '/',
      path: '/',
      httpMethod: 'GET',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      body: null,
      isBase64Encoded: false,
      requestContext: {
        accountId: MOCK_ACCOUNT_ID,
        apiId: MOCK_API_ID,
        authorizer: null,
        domainName: `${MOCK_API_ID}.execute-api.${MOCK_REGION}.amazonaws.com`,
        domainPrefix: MOCK_API_ID,
        extendedRequestId: MOCK_EXTENDED_REQUEST_ID,
        httpMethod: 'GET',
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
          sourceIp: MOCK_SOURCE_IP,
          user: null,
          userAgent: MOCK_USER_AGENT,
          userArn: null,
        },
        path: `/${MOCK_STAGE}/`,
        protocol: 'HTTP/1.1',
        requestId: MOCK_REQUEST_ID,
        requestTime: '08/Aug/2026:12:30:45 +0000',
        requestTimeEpoch: FIXED_EPOCH,
        resourceId: MOCK_RESOURCE_ID,
        resourcePath: '/',
        stage: MOCK_STAGE,
      },
    });
  });

  it('defaults requestTimeEpoch to the current clock', () => {
    const before = Date.now();

    const event = createMockEventV1();

    expect(event.requestContext.requestTimeEpoch).toBeGreaterThanOrEqual(before);
    expect(event.requestContext.requestTimeEpoch).toBeLessThanOrEqual(Date.now());
  });

  it('upper cases the method in both places it appears', () => {
    const event = createMockEventV1({ method: 'post' });

    expect(event.httpMethod).toBe('POST');
    expect(event.requestContext.httpMethod).toBe('POST');
  });

  it('adds the leading slash when the path has none', () => {
    const event = createMockEventV1({ path: 'health' });

    expect(event.path).toBe('/health');
    expect(event.resource).toBe('/health');
  });

  it('interpolates :param segments and exposes them in pathParameters', () => {
    const event = createMockEventV1({
      path: '/users/:userId/orders/:orderId',
      pathParameters: { userId: 'u-1', orderId: 'o-2' },
    });

    expect(event.path).toBe('/users/u-1/orders/o-2');
    expect(event.resource).toBe('/users/{userId}/orders/{orderId}');
    expect(event.requestContext.resourcePath).toBe('/users/{userId}/orders/{orderId}');
    expect(event.pathParameters).toEqual({ userId: 'u-1', orderId: 'o-2' });
  });

  it('accepts the {param} template form used by API Gateway', () => {
    const event = createMockEventV1({ path: '/users/{id}', pathParameters: { id: '42' } });

    expect(event.path).toBe('/users/42');
    expect(event.resource).toBe('/users/{id}');
  });

  it('coerces path parameter values to strings', () => {
    const event = createMockEventV1({ path: '/users/:id', pathParameters: { id: 42 } });

    expect(event.path).toBe('/users/42');
    expect(event.pathParameters).toEqual({ id: '42' });
  });

  it('does not treat a colon inside a segment as a parameter', () => {
    const event = createMockEventV1({ path: '/schedules/12:30' });

    expect(event.path).toBe('/schedules/12:30');
    expect(event.resource).toBe('/schedules/12:30');
    expect(event.pathParameters).toBeNull();
  });

  it('throws when a templated segment has no matching path parameter', () => {
    expect(() => createMockEventV1({ path: '/users/:id' })).toThrow(TypeError);
    expect(() => createMockEventV1({ path: '/users/:id', pathParameters: { other: '1' } })).toThrow(
      /pathParameters has no "id" entry/
    );
  });

  it('throws when the path carries a query string', () => {
    expect(() => createMockEventV1({ path: '/users?limit=10' })).toThrow(
      /must not contain a query string/
    );
  });

  it('keeps path parameters that the path does not reference', () => {
    const event = createMockEventV1({ path: '/users', pathParameters: { id: '1' } });

    expect(event.resource).toBe('/users');
    expect(event.pathParameters).toEqual({ id: '1' });
  });

  it('fills both query maps, keeping the last value in the single-value map', () => {
    const event = createMockEventV1({ query: { include: ['items', 'totals'], page: '2' } });

    expect(event.queryStringParameters).toEqual({ include: 'totals', page: '2' });
    expect(event.multiValueQueryStringParameters).toEqual({
      include: ['items', 'totals'],
      page: ['2'],
    });
  });

  it('coerces query values to strings', () => {
    const event = createMockEventV1({ query: { page: 2, active: true } });

    expect(event.queryStringParameters).toEqual({ page: '2', active: 'true' });
  });

  it('nulls both query maps when there is no query parameter', () => {
    const event = createMockEventV1({ query: {} });

    expect(event.queryStringParameters).toBeNull();
    expect(event.multiValueQueryStringParameters).toBeNull();
  });

  it('preserves header case and fills multiValueHeaders', () => {
    const event = createMockEventV1({
      headers: { Authorization: 'Bearer token', 'X-Trace': ['a', 'b'] },
    });

    expect(event.headers).toEqual({ Authorization: 'Bearer token', 'X-Trace': 'b' });
    expect(event.multiValueHeaders).toEqual({
      Authorization: ['Bearer token'],
      'X-Trace': ['a', 'b'],
    });
  });

  it('drops header entries whose value is null or undefined', () => {
    const event = createMockEventV1({
      headers: {
        absent: undefined as unknown as string,
        empty: null as unknown as string,
        present: '1',
      },
    });

    expect(event.headers).toEqual({ present: '1' });
    expect(event.multiValueHeaders).toEqual({ present: ['1'] });
  });

  it('derives the user agent from the user-agent header, whatever its case', () => {
    const event = createMockEventV1({ headers: { 'User-Agent': 'jest/29' } });

    expect(event.requestContext.identity.userAgent).toBe('jest/29');
  });

  it('prefers an explicit userAgent over the header', () => {
    const event = createMockEventV1({
      headers: { 'user-agent': 'jest/29' },
      userAgent: 'explicit/1',
    });

    expect(event.requestContext.identity.userAgent).toBe('explicit/1');
  });

  it('serializes an object body to JSON', () => {
    const event = createMockEventV1({ body: { productId: 'p-1', quantity: 2 } });

    expect(event.body).toBe('{"productId":"p-1","quantity":2}');
    expect(JSON.parse(event.body as string)).toEqual({ productId: 'p-1', quantity: 2 });
  });

  it('uses a string body verbatim', () => {
    const event = createMockEventV1({ body: 'not json at all' });

    expect(event.body).toBe('not json at all');
  });

  it('uses null for a missing body and for a value JSON cannot represent', () => {
    expect(createMockEventV1().body).toBeNull();
    expect(createMockEventV1({ body: null }).body).toBeNull();
    expect(createMockEventV1({ body: () => undefined }).body).toBeNull();
  });

  it('prefixes requestContext.path with the stage', () => {
    const event = createMockEventV1({
      path: '/users/:id',
      pathParameters: { id: '7' },
      stage: 'prod',
    });

    expect(event.path).toBe('/users/7');
    expect(event.requestContext.path).toBe('/prod/users/7');
    expect(event.requestContext.stage).toBe('prod');
  });

  it('turns described cookies into a single Cookie header', () => {
    const event = createMockEventV1({ cookies: ['session=abc', 'theme=dark'] });

    expect(event.headers.Cookie).toBe('session=abc; theme=dark');
    expect(event.multiValueHeaders.Cookie).toEqual(['session=abc; theme=dark']);
  });

  it('replaces any described cookie header when cookies are given', () => {
    const event = createMockEventV1({
      headers: { cookie: 'stale=1' },
      cookies: ['session=abc'],
    });

    expect(event.multiValueHeaders.cookie).toBeUndefined();
    expect(event.headers.Cookie).toBe('session=abc');
  });

  it('removes the cookie header when cookies is an empty array', () => {
    const event = createMockEventV1({ headers: { Cookie: 'stale=1' }, cookies: [] });

    expect(event.headers).toEqual({});
    expect(event.multiValueHeaders).toEqual({});
  });

  it('keeps a described cookie header untouched when cookies is omitted', () => {
    const event = createMockEventV1({ headers: { Cookie: 'session=abc' } });

    expect(event.headers.Cookie).toBe('session=abc');
  });

  it('honours the identity, api and encoding overrides', () => {
    const event = createMockEventV1({
      accountId: '999999999999',
      apiId: 'custom1api',
      requestId: 'req-1',
      sourceIp: '10.0.0.1',
      isBase64Encoded: true,
      stageVariables: { tableName: 'orders', retries: 3 },
      authorizer: { claims: { sub: 'user-1' } },
    });

    expect(event.requestContext.accountId).toBe('999999999999');
    expect(event.requestContext.apiId).toBe('custom1api');
    expect(event.requestContext.domainName).toBe(
      `custom1api.execute-api.${MOCK_REGION}.amazonaws.com`
    );
    expect(event.requestContext.domainPrefix).toBe('custom1api');
    expect(event.requestContext.requestId).toBe('req-1');
    expect(event.requestContext.identity.sourceIp).toBe('10.0.0.1');
    expect(event.isBase64Encoded).toBe(true);
    expect(event.stageVariables).toEqual({ tableName: 'orders', retries: '3' });
    expect(event.requestContext.authorizer).toEqual({ claims: { sub: 'user-1' } });
  });

  it('never shares references with the description', () => {
    const description = {
      path: '/users/:id',
      pathParameters: { id: '1' },
      headers: { 'x-trace': ['a'] },
      query: { tag: ['x'] },
    };

    const event = createMockEventV1(description);
    event.pathParameters!.id = 'mutated';
    event.multiValueHeaders['x-trace']!.push('b');
    event.multiValueQueryStringParameters!.tag!.push('y');

    expect(description.pathParameters).toEqual({ id: '1' });
    expect(description.headers['x-trace']).toEqual(['a']);
    expect(description.query.tag).toEqual(['x']);
  });
});

describe('createMockEventV2', () => {
  it('builds a complete payload 2.0 event from an empty description', () => {
    const event = createMockEventV2({ requestTimeEpoch: FIXED_EPOCH });

    expect(event).toEqual({
      version: '2.0',
      routeKey: 'GET /',
      rawPath: '/',
      rawQueryString: '',
      headers: {},
      isBase64Encoded: false,
      requestContext: {
        accountId: MOCK_ACCOUNT_ID,
        apiId: MOCK_API_ID,
        domainName: `${MOCK_API_ID}.execute-api.${MOCK_REGION}.amazonaws.com`,
        domainPrefix: MOCK_API_ID,
        http: {
          method: 'GET',
          path: '/',
          protocol: 'HTTP/1.1',
          sourceIp: MOCK_SOURCE_IP,
          userAgent: MOCK_USER_AGENT,
        },
        requestId: MOCK_REQUEST_ID,
        routeKey: 'GET /',
        stage: MOCK_STAGE,
        time: '08/Aug/2026:12:30:45 +0000',
        timeEpoch: FIXED_EPOCH,
      },
    });
  });

  it('omits the fields API Gateway leaves out when they are empty', () => {
    const event = createMockEventV2();

    expect('body' in event).toBe(false);
    expect('cookies' in event).toBe(false);
    expect('pathParameters' in event).toBe(false);
    expect('queryStringParameters' in event).toBe(false);
    expect('stageVariables' in event).toBe(false);
  });

  it('defaults timeEpoch to the current clock', () => {
    const before = Date.now();

    const event = createMockEventV2();

    expect(event.requestContext.timeEpoch).toBeGreaterThanOrEqual(before);
    expect(event.requestContext.timeEpoch).toBeLessThanOrEqual(Date.now());
  });

  it('derives the route key from the method and the route template', () => {
    const event = createMockEventV2({
      method: 'delete',
      path: '/users/:id',
      pathParameters: { id: '42' },
    });

    expect(event.routeKey).toBe('DELETE /users/{id}');
    expect(event.requestContext.routeKey).toBe('DELETE /users/{id}');
    expect(event.rawPath).toBe('/users/42');
    expect(event.pathParameters).toEqual({ id: '42' });
    expect(event.requestContext.http).toEqual({
      method: 'DELETE',
      path: '/users/42',
      protocol: 'HTTP/1.1',
      sourceIp: MOCK_SOURCE_IP,
      userAgent: MOCK_USER_AGENT,
    });
  });

  it('repeats keys in rawQueryString and joins values with a comma', () => {
    const event = createMockEventV2({ query: { fields: ['name', 'email'], page: 2 } });

    expect(event.rawQueryString).toBe('fields=name&fields=email&page=2');
    expect(event.queryStringParameters).toEqual({ fields: 'name,email', page: '2' });
  });

  it('percent encodes the raw query string', () => {
    const event = createMockEventV2({ query: { 'filter[name]': 'John Doe & Sons' } });

    expect(event.rawQueryString).toBe('filter%5Bname%5D=John%20Doe%20%26%20Sons');
  });

  it('lower cases header names and joins repeated values with a comma', () => {
    const event = createMockEventV2({
      headers: { Authorization: 'Bearer token', 'X-Trace': ['a', 'b'] },
    });

    expect(event.headers).toEqual({ authorization: 'Bearer token', 'x-trace': 'a,b' });
  });

  it('moves described cookies out of the headers', () => {
    const event = createMockEventV2({
      headers: { 'Content-Type': 'application/json' },
      cookies: ['session=abc', 'theme=dark'],
    });

    expect(event.cookies).toEqual(['session=abc', 'theme=dark']);
    expect(event.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('parses the cookie header into the cookies array when cookies are not described', () => {
    const event = createMockEventV2({ headers: { Cookie: 'session=abc; theme=dark ; ' } });

    expect(event.cookies).toEqual(['session=abc', 'theme=dark']);
    expect(event.headers).toEqual({});
  });

  it('still derives the user agent when a cookie header is present', () => {
    const event = createMockEventV2({
      headers: { Cookie: 'session=abc', 'user-agent': 'jest/29' },
    });

    expect(event.requestContext.http.userAgent).toBe('jest/29');
  });

  it('serializes the body and honours isBase64Encoded', () => {
    const event = createMockEventV2({ body: { ok: true }, isBase64Encoded: true });

    expect(event.body).toBe('{"ok":true}');
    expect(event.isBase64Encoded).toBe(true);
  });

  it('attaches the authorizer context only when described', () => {
    const withAuthorizer = createMockEventV2({ authorizer: { lambda: { userId: 'u-1' } } });
    const withoutAuthorizer = createMockEventV2();

    expect(withAuthorizer.requestContext).toHaveProperty('authorizer', {
      lambda: { userId: 'u-1' },
    });
    expect(withoutAuthorizer.requestContext).not.toHaveProperty('authorizer');
  });

  it('includes stage variables only when described', () => {
    expect(createMockEventV2({ stageVariables: { retries: 3 } }).stageVariables).toEqual({
      retries: '3',
    });
    expect(createMockEventV2().stageVariables).toBeUndefined();
  });

  it('validates the path just like the 1.0 builder', () => {
    expect(() => createMockEventV2({ path: '/users/:id' })).toThrow(TypeError);
    expect(() => createMockEventV2({ path: '/users?limit=10' })).toThrow(
      /must not contain a query string/
    );
  });

  it('never shares references with the description', () => {
    const description = { path: '/users/:id', pathParameters: { id: '1' }, cookies: ['a=1'] };

    const event = createMockEventV2(description);
    event.pathParameters!.id = 'mutated';
    event.cookies!.push('b=2');

    expect(description.pathParameters).toEqual({ id: '1' });
    expect(description.cookies).toEqual(['a=1']);
  });
});

describe('createMockFetch', () => {
  const description = {
    method: 'patch',
    path: '/users/:id',
    pathParameters: { id: '42' },
    query: { fields: ['name', 'email'] },
    headers: { Authorization: 'Bearer token' },
    body: { name: 'Ada' },
  };

  it('returns the same call in both payload formats', () => {
    const { v1, v2 } = createMockFetch(description);

    expect(v1.httpMethod).toBe('PATCH');
    expect(v2.requestContext.http.method).toBe('PATCH');
    expect(v1.path).toBe('/users/42');
    expect(v2.rawPath).toBe('/users/42');
    expect(v1.resource).toBe('/users/{id}');
    expect(v2.routeKey).toBe('PATCH /users/{id}');
    expect(v1.pathParameters).toEqual(v2.pathParameters);
    expect(v1.body).toBe(v2.body);
  });

  it('keeps identity fields aligned between the two events', () => {
    const { v1, v2 } = createMockFetch({ ...description, requestId: 'req-9', stage: 'prod' });

    expect(v1.requestContext.requestId).toBe(v2.requestContext.requestId);
    expect(v1.requestContext.apiId).toBe(v2.requestContext.apiId);
    expect(v1.requestContext.accountId).toBe(v2.requestContext.accountId);
    expect(v1.requestContext.stage).toBe(v2.requestContext.stage);
    expect(v1.requestContext.identity.sourceIp).toBe(v2.requestContext.http.sourceIp);
    expect(v1.requestContext.identity.userAgent).toBe(v2.requestContext.http.userAgent);
  });

  it('resolves the default timestamp once, so both events agree on it', () => {
    const { v1, v2 } = createMockFetch(description);

    expect(v1.requestContext.requestTimeEpoch).toBe(v2.requestContext.timeEpoch);
    expect(v1.requestContext.requestTime).toBe(v2.requestContext.time);
  });

  it('honours an explicit requestTimeEpoch', () => {
    const { v1, v2 } = createMockFetch({ requestTimeEpoch: FIXED_EPOCH });

    expect(v1.requestContext.requestTimeEpoch).toBe(FIXED_EPOCH);
    expect(v2.requestContext.timeEpoch).toBe(FIXED_EPOCH);
  });

  it('builds independent objects', () => {
    const { v1, v2 } = createMockFetch(description);

    v1.pathParameters!.id = 'mutated';

    expect(v2.pathParameters).toEqual({ id: '42' });
    expect(description.pathParameters).toEqual({ id: '42' });
  });

  it('works with no description at all', () => {
    const { v1, v2 } = createMockFetch();

    expect(v1.httpMethod).toBe('GET');
    expect(v2.routeKey).toBe('GET /');
  });
});
