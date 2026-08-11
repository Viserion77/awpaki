# awpaki

**AWS Patterns Kit** — a TypeScript library for the code every AWS Lambda repeats.

```bash
npm install awpaki
```

## Why it exists

The AWS SDK tells you how to call a service. It says nothing about the fifty lines that surround
every handler: parsing the body, validating parameters, choosing a status code, deciding whether
an error should retry or return, logging the event in a form CloudWatch can actually query,
building the client once instead of per invocation.

That code gets written again in every function, slightly differently each time, and the parts
that get skipped under deadline are always the same ones — the entry log, or the `catch` that
distinguishes a client error from a bug.

awpaki packages those patterns. It is a thin framework, not an SDK wrapper: you still write
ordinary AWS SDK commands, and you can adopt one helper without adopting any other.

## Quick start

```typescript
import { createApiGatewayHandlerV2, ParameterType, NotFound } from 'awpaki';

export const handler = createApiGatewayHandlerV2({
  schema: {
    pathParameters: {
      userId: { label: 'User ID', required: true, expectedType: ParameterType.STRING },
    },
  },
  execute: async ({ params }) => {
    const user = await getUser(params.userId);

    if (!user) throw new NotFound(`User ${params.userId} not found`);

    return { body: user };
  },
});
```

That handler already logs the request as structured JSON, answers `422` with a per-field error
map when `userId` is missing, turns the `NotFound` into a `404`, re-throws anything unexpected so
Lambda's retry and DLQ behaviour still applies, and returns `200` with
`Content-Type: application/json`.

The pieces work on their own too — use `extractEventParams`, `logSqsEvent` or `s3Client` without
the factory.

## What's in the box

| Module         | Import from            | Solves                                                                  |
| -------------- | ---------------------- | ------------------------------------------------------------------------ |
| Handlers       | `awpaki/handlers`      | The Lambda skeleton: log → extract → gate → execute → catch              |
| Extractors     | `awpaki/extractors`    | Schema-driven parameter extraction with multi-error reporting            |
| Decoders       | `awpaki/decoders`      | Coerce and normalize values, throwing on invalid input                   |
| Validators     | `awpaki/validators`    | Pure predicates — e-mail, image MIME, deep equality, names, SQL datetimes |
| Parsers        | `awpaki/parsers`       | JSON body parsing with a typed `BadRequest` instead of a 500             |
| Errors         | `awpaki/errors`        | HTTP error classes and one error handler per trigger type                |
| Constants      | `awpaki/constants`     | `HttpStatus`, `HttpErrorStatus` and their guards                          |
| Loggers        | `awpaki/loggers`       | Entry loggers per trigger, a pluggable logger, a per-invocation log buffer |
| AWS clients    | `awpaki/clients/<svc>` | SDK v3 singletons with retry, `invokeLambda`, cross-account credentials   |
| Environment    | `awpaki/environment`   | Region, endpoint and stage resolution with documented precedence          |
| Utils          | `awpaki/utils`         | Objects, strings, dates, template interpolation, permission bitmasks      |
| Testing        | `awpaki/testing`       | Realistic API Gateway events and Lambda contexts for your test suite      |

Thirteen AWS clients are covered: DynamoDB, S3, SQS, SNS, Lambda, IoT Core, OpenSearch, SES,
CloudWatch, API Gateway, Secrets Manager, and Timestream (query and write).

## Imports

```typescript
import { parseJsonBody } from 'awpaki';           // root — utility-only
import { parseJsonBody } from 'awpaki/parsers';   // category
import { s3Client } from 'awpaki/clients/s3';     // one AWS SDK package, and only that one
```

The root barrel **never loads an `@aws-sdk/*` package**, so a project that only uses
`BadRequest` does not pay for thirteen SDKs at cold start. AWS SDK packages are optional peer
dependencies: install only the ones whose client you import.

## Documentation

Full reference in [docs/](docs/):

- [Getting started](docs/getting-started.md) — install, import model, first handler
- [Handlers](docs/handlers.md) — the factories, and composing by hand for other triggers
- [Validation](docs/validation.md) — schemas, decoders, validators, body parsing
- [Errors](docs/errors.md) — error classes, status codes, per-trigger handlers
- [Observability](docs/observability.md) — structured logs, pluggable logger, log buffering
- [AWS clients](docs/aws-clients.md) — retry, `invokeLambda`, cross-account credentials
- [Configuration](docs/configuration.md) — every environment variable, and its fallback
- [Utilities](docs/utilities.md) — the dependency-free helpers
- [Testing](docs/testing.md) — mock events and contexts
- [Architecture](docs/architecture.md) — why the package is shaped this way
- [Roadmap](docs/roadmap.md) — what is planned, and what will never land

## Requirements

Node.js >= 18 — the oldest Lambda runtime the library is tested against. TypeScript types are
included, and `@types/aws-lambda` ships as a real dependency, so Lambda event types work with no
extra install.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the working rules — module boundaries, code style,
type-safety rules, the documentation rule, tests and releases.

## License

[MIT](LICENSE).

## Credits

awpaki is used in production, every day, at [Seventy Sete](http://seventysete.com/).

Several patterns here were hardened in a private internal fork before being generalized and
ported back: the handler factories, the per-invocation log collector, the synthetic-event
Lambda invoker and the environment resolvers. Anything tied to a specific product or
jurisdiction was deliberately left out — see
[the scope decisions](docs/roadmap.md#deliberately-out-of-scope).
