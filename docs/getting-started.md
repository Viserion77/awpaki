# Getting started

## Install

```bash
npm install awpaki
```

Requires **Node.js >= 18** — the oldest Lambda runtime the library is tested against.

Nothing else is needed for parsers, errors, extractors, decoders, validators, loggers, handlers,
utils or the test helpers. AWS SDK packages are **optional peer dependencies**: you install only
the ones whose client you actually import.

```bash
# Only if you import awpaki/clients/s3
npm install @aws-sdk/client-s3 async-retry
```

The full per-service list is in [AWS clients](aws-clients.md#installing-a-client).

## The import model

There are three ways in, and the difference is not cosmetic — it decides what gets loaded.

```typescript
// 1. Root — everything except AWS clients and test helpers
import { parseJsonBody, BadRequest, createApiGatewayHandlerV2 } from 'awpaki';

// 2. Category subpath — the same symbols, narrower module graph
import { parseJsonBody } from 'awpaki/parsers';

// 3. Client subpath — one AWS SDK package resolved, and only that one
import { s3Client } from 'awpaki/clients/s3';
```

The root barrel is **utility-only**: it never loads an `@aws-sdk/*` package, so a project that
uses `BadRequest` and nothing else does not pay for thirteen SDKs at cold start. That is why
clients are not re-exported from `awpaki` — the rationale, and what broke before this rule
existed, is in [architecture](architecture.md#the-root-barrel-is-utility-only).

Prefer the narrowest import that works. For clients, always prefer
`awpaki/clients/<service>` over the `awpaki/clients` aggregate: the aggregate resolves lazily and
works, but the per-service subpath fails at *import* time when a peer is missing, instead of on
first use.

## Your first handler

The library's shortest path is a handler factory. It owns the skeleton — entry log, parameter
extraction and validation, gates, response shaping, a single `catch` — and leaves you the
schema and the business function:

```typescript
import { createApiGatewayHandlerV2, ParameterType, NotFound } from 'awpaki';

export const handler = createApiGatewayHandlerV2({
  schema: {
    pathParameters: {
      userId: {
        label: 'User ID',
        required: true,
        expectedType: ParameterType.STRING,
      },
    },
  },
  execute: async ({ params }) => {
    const user = await getUser(params.userId);

    if (!user) throw new NotFound(`User ${params.userId} not found`);

    return { body: user };
  },
});
```

What you get without writing it:

- the request is logged as **structured JSON** on entry, with `requestId` and route metadata as
  top-level fields;
- a missing or non-string `userId` answers `422` with a per-field error map, before `execute`
  runs;
- the `NotFound` becomes a `404` with a JSON body; any *other* error is re-thrown so the
  invocation fails and Lambda's retry/DLQ behaviour still applies;
- returning `{ body }` produces `200` with `Content-Type: application/json`; returning nothing
  produces `204` with no `Content-Type`.

Three factories exist — API Gateway HTTP API, direct Lambda invoke, and SQS with partial batch
responses. See [handlers](handlers.md). Triggers without a factory (API Gateway REST, AppSync,
S3, SNS, EventBridge, DynamoDB Streams) compose the same pieces by hand, which
[handlers](handlers.md#triggers-without-a-factory) shows.

## Where to go next

- Declaring what the request must contain → [validation](validation.md)
- Choosing the right error to throw → [errors](errors.md)
- Making the logs queryable, and cheaper → [observability](observability.md)
- Talking to AWS with retry → [AWS clients](aws-clients.md)
- Environment variables the library reads → [configuration](configuration.md)
