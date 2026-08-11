# Testing

`awpaki/testing` builds realistic API Gateway events and Lambda contexts for **your** test
suite. Nothing here runs in production, which is why it is reachable only through this subpath
and is not re-exported from the package root.

A hand-written API Gateway event is 60 lines of `requestContext` you do not care about, and the
fields that get faked wrong are exactly the ones the code under test reads:
`multiValueHeaders`, `resource` versus `path`, `rawQueryString`, the cookie handling that
differs between payload formats. A fixture that is wrong in those places tests a shape AWS never
sends.

## Events

```typescript
import { createMockEventV1, createMockEventV2 } from 'awpaki/testing';

const event = createMockEventV2({
  method: 'POST',
  path: '/users/:id',
  pathParameters: { id: '42' },
  query: { include: ['profile', 'roles'] },
  headers: { authorization: 'Bearer token' },
  body: { name: 'Ana' },
});
```

From that description the builders derive everything API Gateway would:

- **1.0** — `resource` (`/users/{id}`), `path` (`/users/42`), `httpMethod`, `headers` **and**
  `multiValueHeaders`, `queryStringParameters` **and** `multiValueQueryStringParameters`, and a
  full `requestContext`.
- **2.0** — `routeKey` (`POST /users/{id}`), `rawPath`, `rawQueryString`, comma-joined headers,
  the `cookies` array, and `requestContext.http`.

Details that follow the real service rather than convenience: `:id` and `{id}` are equivalent in
`path`; an array value becomes a repeated parameter or header, collapsed the way each format
collapses it (1.0 keeps the last value, 2.0 joins with commas); a non-string `body` is
`JSON.stringify`d; cookies become a `Cookie` header in 1.0 and the `cookies` array in 2.0, with
the header dropped.

A `:param` in the path with no matching entry in `pathParameters` **throws**. A fixture whose
path parameters do not match its path is a test that passes for the wrong reason.

Every other field (`stage`, `apiId`, `accountId`, `requestId`, `sourceIp`, `userAgent`,
`stageVariables`, `authorizer`, `isBase64Encoded`) has a documented default and an override, so
a test only pins what it asserts on. The defaults are exported as constants (`MOCK_STAGE`,
`MOCK_REQUEST_ID`, …) — assert against those instead of copying literals.

The builders read no environment variable and generate no random value, so the same description
always produces the same event. The only exception is `requestTimeEpoch`, which defaults to
`Date.now()` and can be pinned.

### Testing v1/v2 parity

```typescript
import { createMockFetch } from 'awpaki/testing';

const { v1, v2 } = createMockFetch({ method: 'GET', path: '/users/:id', pathParameters: { id: '42' } });

expect(await restHandler(v1, context)).toEqual(expected);
expect(await httpApiHandler(v2, context)).toEqual(expected);
```

Both events come from the **same** description, which is the point: it is how you prove a
handler migrated from REST to HTTP API still behaves identically, on the one axis where the two
payload formats genuinely differ.

## Context

```typescript
import { createMockContext } from 'awpaki/testing';

const context = createMockContext();

// Pin the budget so the code takes its "not enough time left" branch
const tight = createMockContext({ functionName: 'orders-api', getRemainingTimeInMillis: 200 });
tight.invokedFunctionArn; // 'arn:aws:lambda:us-east-1:123456789012:function:orders-api'

// A budget that shrinks on every call
let remaining = 3_000;
const shrinking = createMockContext({ getRemainingTimeInMillis: () => (remaining -= 1_000) });
```

`invokedFunctionArn` and `logGroupName` are derived from the resolved `functionName`, so
overriding the name keeps the whole context coherent — no more fixtures where the ARN names a
different function than `functionName`. Explicit values still win.

`getRemainingTimeInMillis` accepts a number or a function. The function form is what exercises
time-budget logic, including the pre-timeout flush of the
[log collector](observability.md#per-invocation-log-buffer).

The deprecated `done`/`fail`/`succeed` callbacks are present as no-ops so a handler that touches
them does not crash the test.

## Testing handlers built with the factories

The factories return an ordinary `(event, context)` function, so there is nothing special to do:

```typescript
import { createMockEventV2, createMockContext } from 'awpaki/testing';
import { resetLogger, setLogger } from 'awpaki/loggers';

afterEach(() => resetLogger());

it('answers 404 for an unknown user', async () => {
  setLogger({ info() {}, debug() {}, warn() {}, error() {} }); // keep the test output quiet

  const response = await handler(
    createMockEventV2({ path: '/users/:id', pathParameters: { id: 'missing' } }),
    createMockContext()
  );

  expect(response.statusCode).toBe(404);
});
```

Silencing logs with `setLogger` and restoring with `resetLogger` is usually all the setup a
handler test needs — the library writes to `stdout`, not through `console`, so `jest.spyOn(console, …)`
will not intercept it.
