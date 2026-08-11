# Handlers

Every Lambda repeats the same skeleton: log the event, pull the parameters out, validate them,
check authorization, run the business logic, shape the response, catch everything. Written by
hand it is 40 lines of boilerplate per route, and the parts that get skipped under deadline are
always the same — the entry log, or the `catch` that distinguishes a client error from a bug.

The factories in `awpaki/handlers` own that skeleton. You declare a schema and a business
function; they run the rest, in this exact order:

1. **per-invocation log buffer** (outermost, opt-in — see [observability](observability.md))
2. **entry log** of the event
3. **`extractEventParams`** against your schema
4. **gates** — API key first, then the `authorize` hook
5. **`execute`** — your code
6. **response shaping**
7. **a single `catch`** delegating to the trigger's error handler

The order is not arbitrary. The log comes before extraction so a request rejected by validation
still appears in CloudWatch. The API key gate runs before `authorize` so an unauthenticated
caller never reaches code that assumes a caller identity. The buffer wraps everything so it also
captures the error line.

## `createApiGatewayHandlerV2`

For HTTP APIs (payload format 2.0).

```typescript
import { createApiGatewayHandlerV2, ParameterType, Unauthorized } from 'awpaki';

export const handler = createApiGatewayHandlerV2({
  schema: {
    pathParameters: {
      id: { label: 'User ID', required: true, expectedType: ParameterType.STRING },
    },
  },
  checkApiKey: process.env.API_KEY,
  authorize: ({ event }) => {
    if (!event.headers.authorization) throw new Unauthorized('Token required');
  },
  execute: async ({ params, event, context }) => ({ body: await getUser(params.id) }),
});
```

`execute` receives `{ params, event, context }` — the validated parameters plus the untouched
event, for whatever the schema cannot express.

### Response rules

`execute` returns an object where **every field is optional**, and the shape of the response
follows from what is present:

| `execute` returns             | Response                                                        |
| ----------------------------- | --------------------------------------------------------------- |
| nothing, or no `body`         | `204`, **no `Content-Type`** — an empty response has no media type |
| `{ body: obj }`               | `200` + `Content-Type: application/json`, body JSON-serialized   |
| `{ body: 'raw' }`             | `200`, string passed through untouched (CSV, XML, pre-rendered JSON) |
| `{ statusCode, body }`        | that status code                                                 |
| `{ cookies: [...] }`          | emitted in the payload-format-2.0 `cookies` field, not as headers |

Headers merge case-insensitively across three sources, in increasing precedence: the
`Content-Type` default, `options.headers`, then the result's `headers`. A plain object spread
would keep `Content-Type` and `content-type` as two keys and API Gateway would emit both, so the
merge folds them.

### The `checkApiKey` gate is enabled by presence, not by value

This is the one detail worth reading twice:

```typescript
checkApiKey: process.env.API_KEY,   // variable unset → the handler throws (5xx)
// (option omitted entirely)        // → no API key gate
```

The gate turns on because the **property exists**, never because its value is truthy. If the
implementation were `if (options.checkApiKey)`, a missing environment variable in production
would silently disable authentication on every route — a deploy misconfiguration becoming an
open endpoint, with nothing in the logs to say so.

Instead, a present-but-unusable value throws a plain `Error`, the invocation fails loudly with a
5xx, and the alarm fires. To run a route without a key, remove the option.

The key is read from `x-api-key` (case-insensitive) unless `apiKeyHeader` says otherwise, and a
mismatch throws `Unauthorized` (401).

### `authorize`

A hook, not a policy: throw `Unauthorized` (401) or `Forbidden` (403) to reject, return normally
to allow. It receives the same `{ params, event, context }` as `execute`, so it can read a
verified JWT claim from `event.requestContext.authorizer`, a tenant id from the path, or
anything else.

The library deliberately ships no group/role/domain model — whose users these are is your
application's business, not a reusable AWS pattern.

## `createInvokeHandler`

For Lambda-to-Lambda calls, where there is no HTTP layer in front.

The payload of a direct invoke has no fixed shape. Some callers send parameters flat, others
forward an API-Gateway-like envelope because the same function is also exposed as a route.
`normalizeInvokePayload` accepts both and produces one canonical record, so a single schema
serves every caller:

```typescript
import { createInvokeHandler } from 'awpaki';

export const handler = createInvokeHandler({
  schema: { userId: { label: 'User ID', required: true } },
  execute: async ({ params }) => getUser(params.userId),
});

// both reach the same handler, with the same schema:
//   { userId: '1' }
//   { body: '{"userId":"1"}' }
```

Fields inside `body` are parsed and **also lifted to the root**, so both schema styles work. A
body that is not an object after parsing (an array, a number) stays under `body` only — lifting
it would produce numeric keys.

There is no response serialization here: what `execute` returns *is* the invoke response, so the
calling Lambda receives real objects instead of a JSON string it has to parse again.

Errors follow `handleGenericError`: an `HttpError` becomes the structured
`{ error, message, statusCode, data }` envelope so the caller can branch on `statusCode`, and
anything else is re-thrown to fail the invocation.

## `createSqsHandler`

For queues, with partial batch responses.

A throwing SQS handler makes the **whole batch** visible again: records that already succeeded
are delivered a second time, and one poison message can keep the batch cycling until the redrive
policy gives up. This factory processes each record in isolation and reports only the ones that
actually failed:

```typescript
import { createSqsHandler, ParameterType } from 'awpaki';

export const handler = createSqsHandler({
  schema: {
    body: {
      orderId: { label: 'Order ID', required: true, expectedType: ParameterType.STRING },
    },
  },
  execute: async ({ params, record }) => {
    await processOrder(params.orderId, record.messageId);
  },
});

// one bad record out of ten:
// { batchItemFailures: [{ itemIdentifier: 'msg-4' }] }
```

Two things this requires from you:

- **`functionResponseTypes: [ReportBatchItemFailures]` on the event source mapping.** Without
  it AWS ignores the response and retries the whole batch anyway — the factory's guarantee is
  only as good as that setting.
- **Schemas address message fields under `body`.** The record itself is the event handed to the
  extractor, with `body` already parsed, so `messageAttributes` and the rest of the record stay
  reachable from the schema too.

Records are processed **sequentially**, in the order AWS delivered them, so FIFO queues keep
their guarantees. Every failure — invalid JSON, schema violation, or an error from `execute` —
is caught, logged with its `messageId`, and turned into a `batchItemFailures` entry; the
remaining records still run.

With `parseBody: false` (plain-text queues) the raw text still reaches `execute` as `body`, but
the schema addresses it as `rawBody`: `extractEventParams` JSON-parses any string it finds under
`body`, which is exactly what the option opted out of.

## Triggers without a factory

There is no factory for API Gateway REST (v1), AppSync, S3, SNS, EventBridge or DynamoDB
Streams. Composing the pieces by hand is four lines and keeps full control.

### API Gateway REST (payload format 1.0)

```typescript
import {
  logApiGatewayEvent,
  extractEventParams,
  handleApiGatewayError,
  ParameterType,
  HttpErrorStatus,
  HttpStatus,
  NotFound,
} from 'awpaki';
import type { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  logApiGatewayEvent(event, context);

  try {
    const params = extractEventParams<{ userId: string; email: string; age: number }>(
      {
        pathParameters: {
          userId: {
            label: 'User ID',
            required: true,
            expectedType: ParameterType.STRING,
            statusCodeError: HttpErrorStatus.NOT_FOUND,
          },
        },
        headers: {
          authorization: {
            label: 'Authorization',
            required: true,
            caseInsensitive: true,
            statusCodeError: HttpErrorStatus.UNAUTHORIZED,
          },
        },
        body: {
          email: { label: 'Email', required: true, expectedType: ParameterType.STRING },
          age: { label: 'Age', expectedType: ParameterType.NUMBER, default: 18 },
        },
      },
      event
    );

    const user = await updateUser(params.userId, { email: params.email, age: params.age });

    if (!user) throw new NotFound(`User ${params.userId} not found`);

    return {
      statusCode: HttpStatus.OK,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    };
  } catch (error) {
    return handleApiGatewayError(error);
  }
};
```

### AppSync resolvers

AppSync has no response envelope — the resolver returns the GraphQL value directly, and GraphQL
formats thrown errors into its own `errors` array. That is why `handleAppSyncError` logs and
**always re-throws**.

The schema uses ordinary nesting to reach `arguments` and the Cognito identity:

```typescript
import {
  extractEventParams,
  logAppSyncEvent,
  handleAppSyncError,
  ParameterType,
  HttpErrorStatus,
  NotFound,
  emailString,
} from 'awpaki';
import type { AppSyncResolverHandler } from 'aws-lambda';

interface GetUserArgs {
  id: string;
}

export const getUser: AppSyncResolverHandler<GetUserArgs, User> = async (event, context) => {
  logAppSyncEvent(event, context);

  try {
    const params = extractEventParams<{ id: string; sub: string; email: string }>(
      {
        arguments: {
          id: {
            label: 'User ID',
            required: true,
            expectedType: ParameterType.STRING,
            statusCodeError: HttpErrorStatus.BAD_REQUEST,
          },
        },
        identity: {
          sub: {
            label: 'Caller ID',
            required: true,
            statusCodeError: HttpErrorStatus.UNAUTHORIZED,
          },
          claims: {
            email: { label: 'Caller Email', required: true, decoder: emailString },
          },
        },
      },
      event
    );

    const user = await findUser(params.id);

    if (!user) throw new NotFound(`User ${params.id} not found`);

    return user;
  } catch (error) {
    return handleAppSyncError(error);
  }
};
```

For a mutation whose arguments are nested under `input`, either address them in the schema
(`arguments: { input: { name: {...} } }`) or flatten the event before extracting.

The AppSync event carries more than arguments, and a field resolver reads most of it from
`source`:

```typescript
{
  arguments: TArgs,              // query/mutation arguments
  identity: {                    // caller identity
    sub: string,                 // Cognito user id
    username?: string,
    claims?: Record<string, unknown>,
    sourceIp?: string[],
  },
  source: TSource,               // parent object, for field resolvers
  request: { headers: Record<string, string> },
  info: {
    fieldName: string,           // field being resolved
    parentTypeName: string,      // Query, Mutation, ...
    variables: Record<string, unknown>,
  },
  prev: { result: unknown },     // previous resolver in a pipeline
  stash: Record<string, unknown>, // state shared across pipeline resolvers
}
```

### Everything else

Loggers and error handlers exist for every trigger — see the tables in
[observability](observability.md#entry-loggers-by-trigger) and
[errors](errors.md#error-handlers-by-trigger).

## Typing handlers

Do not hand-write event and return types. `@types/aws-lambda` ships handler types that infer
all three, and it is a real dependency of this package, so it is already installed:

```typescript
import type { SQSHandler } from 'aws-lambda';

export const handler: SQSHandler = async (event, context) => {
  // event: SQSEvent, context: Context, return: SQSBatchResponse | void
};
```

| Handler type                             | Event                         | Return                          | Use case              |
| ---------------------------------------- | ----------------------------- | ------------------------------- | --------------------- |
| `APIGatewayProxyHandler`                 | `APIGatewayProxyEvent`        | `APIGatewayProxyResult`         | REST API              |
| `APIGatewayProxyHandlerV2`               | `APIGatewayProxyEventV2`      | `APIGatewayProxyResultV2`       | HTTP API (2.0)        |
| `AppSyncResolverHandler<TArgs, TResult>` | `AppSyncResolverEvent<TArgs>` | `TResult \| Promise<TResult>`   | AppSync GraphQL       |
| `SQSHandler`                             | `SQSEvent`                    | `SQSBatchResponse \| void`      | Message queues        |
| `SNSHandler`                             | `SNSEvent`                    | `void`                          | Pub/sub               |
| `DynamoDBStreamHandler`                  | `DynamoDBStreamEvent`         | `DynamoDBBatchResponse \| void` | Table streams         |
| `S3Handler`                              | `S3Event`                     | `void`                          | Object events         |
| `EventBridgeHandler<T, D, R>`            | `EventBridgeEvent<T, D>`      | `R`                             | Custom events         |
| `ScheduledHandler<T>`                    | `ScheduledEvent<T>`           | `void`                          | Cron                  |
| `ALBHandler`                             | `ALBEvent`                    | `ALBResult`                     | Load balancer         |

Note the two batch-failure shapes: `SQSBatchResponse` and `DynamoDBBatchResponse` both carry
`{ batchItemFailures: Array<{ itemIdentifier: string }> }`, which is what makes partial batch
processing possible — `createSqsHandler` produces the SQS one for you.

## The log collector seam

Every factory wraps the handler it returns with the collector registered through
`setHandlerLogCollector`, resolved **per invocation** rather than at creation time. Handlers are
usually built at module scope, before your bootstrap code runs, so a collector installed later
still applies.

Nothing is wrapped until you register one, and `withRuntimeLogCollector` is the intended
provider — the factories never import it, so a handler keeps working with no collector at all
(cold path, unit tests, or your own buffering). See
[observability](observability.md#per-invocation-log-buffer).
