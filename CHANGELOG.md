# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
follows [Semantic Versioning](https://semver.org/).

Usage documentation lives in [docs/](docs/); entries here record **what changed and why**, not
how to use the result.

---

## [1.5.3] - 2026-08-10

### Changed

- **`execute` preserves the output type of the command** on every client (`apiGatewayClient`,
  `cloudWatchClient`, `dynamodbClient`, `iotClient`, `lambdaClient`, `openSearchClient`,
  `s3Client`, `secretsManagerClient`, `sesClient`, `snsClient`, `sqsClient`,
  `timestreamQueryClient`, `timestreamWriteClient`). The signature was
  `execute<T = any>(command: any): Promise<T>`, whose two parameters cancelled each other out:
  any object passed as a command, and a result with no shape at the call site. It is now
  generic over the command — `execute<C extends AwsCommand>(command: C): Promise<CommandOutput<C>>`
  — so `execute` is a drop-in for the SDK's own `send`: a typo in a field read from a response
  is a compile error instead of `undefined` in production, and nothing has to be annotated.
  `AwsCommand` and `CommandOutput` are exported from `awpaki/clients` and every client subpath.

  **Breaking, at the type level only** — the runtime is untouched. A call site that annotated
  the result by hand (`execute<GetCommandOutput>(command)`) no longer compiles, because the type
  parameter is now the command rather than the result. The fix is to delete the annotation: the
  inferred type is the same one, and it can no longer be stated wrongly. A call site that passed
  something which is not an SDK command is now rejected, which is the point.

### Added

- **`@smithy/types`** as a direct dependency. It is types-only, adds nothing at runtime, and is
  already a transitive dependency of every AWS SDK client; declaring it directly means the
  published `.d.ts` resolve for a consumer under a strict installer as well.

---

## [1.5.1] - 2026-08-09

The release that turns awpaki from a collection of helpers into a thin framework: handler
factories, a real logging layer, and the shared foundations both needed.

### Added

- **Handler factories** (`awpaki/handlers`) — `createApiGatewayHandlerV2`, `createInvokeHandler`
  and `createSqsHandler` own the skeleton every Lambda repeats (entry log, parameter extraction,
  gates, single `catch`, response shaping), leaving a schema and a business function.
  `createSqsHandler` returns `batchItemFailures` so one poison message no longer replays the
  whole batch. Documented in [docs/handlers.md](docs/handlers.md).
  - `normalizeInvokePayload` accepts both flat payloads and API-Gateway-like envelopes, so one
    schema serves every caller of a directly invoked function.
  - `setHandlerLogCollector` / `getHandlerLogCollector` / `resetHandlerLogCollector` /
    `applyLogCollector` — the seam that lets a log buffer wrap factory-built handlers without the
    factories depending on it.
- **Pluggable logger** (`awpaki/loggers`) — `Logger`, `defaultLogger`, `setLogger`, `getLogger`,
  `resetLogger`, `setLogSink`, `resetLogSink`, `toErrorLog`. The default writes one JSON object
  per line straight to `process.stdout`, object first, so records are field-indexable in
  CloudWatch Logs Insights. No logging dependency is imposed.
- **Per-invocation log buffer** — `withRuntimeLogCollector`, `addTrackingKey`,
  `DEFAULT_PRE_TIMEOUT_MARGIN_MS`, `TRACKING_LOG_MESSAGE`. Holds `INFO`/`DEBUG` in memory and
  releases them only when the invocation fails, with a pre-timeout flush 2 s before the deadline
  so a Lambda timeout still produces logs. Optional per-invocation attribution lines make
  per-tenant cost maps possible. See [docs/observability.md](docs/observability.md).
- **Environment resolvers** (`awpaki/environment`) — `resolveRegion`, `resolveEndpoint`,
  `resolveStage`, `DEFAULT_STAGE`. One tested implementation of the precedence rules that were
  previously inlined in every client.
- **Constants category** (`awpaki/constants`) — `defaultRetryOptions`, plus `HttpStatus`,
  `HttpErrorStatus` and their guards, now with a canonical home.
- **Validators** (`awpaki/validators`) — `isEmail`, `isImage` (+ `IMAGE_MIME_TYPES`),
  `isObjEqual`, `isValidSqlDatetime`, `isValidName`, `isValidFullName`. The subpath previously
  resolved to an empty barrel.
- **Utils** (`awpaki/utils`) — `cleanRecord`, `compareJsonDiff`, `mergeObjectChanges`,
  `dynamicVariableSwitcher` (+ `DEFAULT_VARIABLE_PATTERN`), string helpers
  (`kebabCaseToCamelCase`, `capitalizeFirstLetter`, `onlyDigits`, `removeSpecialCharacters`,
  `stringToArray`), date helpers (`formatDate`, `changeDate`, `getDiffDays`) and the permission
  bitmask engine (`encodeFlags`, `decodeFlags`, `hasFlag`, `addFlags`, `removeFlag`,
  `MAX_FLAG_BIT`). No external dependency.
- **Test helpers** (`awpaki/testing`) — `createMockEventV1`, `createMockEventV2`,
  `createMockFetch`, `createMockContext` and their default constants. Deliberately absent from
  the package root: they are scaffolding for a consumer's tests, not production code.
- **`lambdaClient.invokeLambda`** — builds a well-formed synthetic API Gateway event (payload
  format 1.0 or 2.0), decodes the answer in cascade, turns a `FunctionError` into a thrown
  `BadGateway` instead of a successful result with the crash inside, supports cross-account
  credentials, and injects `x-source-lambda` / `x-trace-id`.
- **`secretsManagerClient.getCredentialsFromSecret`** — reads static credentials from a secret in
  exactly the shape `invokeLambda({ credentials })` expects, with typed failures and no secret
  material in the logs.
- **`getExtensionFromMimeType`** (+ `FILE_EXTENSIONS`, `MIME_TYPE_TO_EXTENSION`) in
  `awpaki/extractors`.
- **`emailString` decoder**, delegating to the `isEmail` validator so decoder and validator can
  never disagree.
- **`npm run test:package`** (`scripts/verify-package.js`) — packs the real tarball and exercises
  it from a project with no AWS SDK installed. The jest suite runs against `src/`, where neither
  `files` nor `exports` exists, and therefore cannot catch a broken subpath map.

### Changed

- **Loggers and error handlers no longer use `console.*`.** All 19 logger calls and all 7 error
  handler calls now go through the pluggable logger, passing the object first. `console.info(msg, obj)`
  emitted an inspected object glued to a text line, unqueryable by field, and under Lambda
  Advanced Logging Controls (`AWS_LAMBDA_LOG_FORMAT=JSON`) it produced a double JSON envelope.
  ⚠️ **The log line format changes.** Alarms or metric filters matching the previous text need
  updating.
- **`awpaki/clients` is now a lazy barrel.** Each client is installed as a getter that `require`s
  its module on first access, so importing the aggregate no longer demands all thirteen AWS SDK
  packages. A missing SDK yields an actionable error on first use instead of a
  `MODULE_NOT_FOUND` at import.
- **`RetryOptions` moved** to `src/clients/index.types.ts`, an SDK-free module, so importing the
  type no longer pulls DynamoDB's typings into unrelated services. It is still re-exported from
  `awpaki/clients` and from each client subpath.
- **`defaultRetryOptions` is a single constant**, imported by all thirteen clients instead of
  being copy-pasted into each one.
- **`@types/aws-lambda` moved to `dependencies`.** As a `devDependency` it never reached
  consumers: three published `.d.ts` files reference it, producing `TS2307` errors, or — with
  `skipLibCheck: true` — silently degrading every Lambda parameter to `any`.
- **The `aws-lambda` peer dependency was removed.** The npm package with that name is an
  unrelated CLI tool; satisfying the peer installed something useless and still provided no
  types.
- **Prefer `awpaki/constants` for `HttpStatus`, `HttpErrorStatus` and their guards.** The exports
  from `awpaki/errors` and from the package root are deprecated but stay for the whole 1.x line —
  both paths resolve to the same objects, so identity comparisons keep working.
- **`validEmail` is deprecated in favour of `emailString`**, which it now aliases.
  ⚠️ **Validation is stricter.** Addresses that used to pass and now fail: single-character or
  numeric TLDs (`a@b.c`, `user@example.c0m`), labels starting or ending with `-`, consecutive
  dots, local parts over 64 characters, addresses over 254. Newly accepted: quoted local parts
  and address literals.
- **Tooling** — `module`/`moduleResolution: node16` (the previous `node` setting ignored the
  `exports` map entirely, so the project could not validate its own subpaths), `isolatedModules`,
  a jest `coverageThreshold` gate, blocking lint in CI, `format:check` in CI, and the packaged
  tarball verified on every run.

### Fixed

- **`expectedType: ParameterType.OBJECT` no longer accepts arrays.** `typeof [] === 'object'`, so
  a field declared as an object accepted `[1,2,3]` and handed the array to code expecting a
  record. ⚠️ **Observable behaviour change**: a payload that used to pass now answers 422.
- **`handleApiGatewayErrorV2` fills real defaults** (`statusCode`, `headers`, `body`) instead of
  suppressing the optional types with non-null assertions, so a subclass overriding
  `toApiGatewayResponseV2` cannot produce a response missing its status code.

---

## [1.5.0] - 2026-05-25

### Added

- **Seven optional AWS clients** under `awpaki/clients/*`: `iotClient`, `openSearchClient`,
  `sesClient`, `cloudWatchClient`, `apiGatewayClient`, `secretsManagerClient`, and
  `timestreamQueryClient` / `timestreamWriteClient`.
- **Per-client subpaths** — `awpaki/clients/dynamodb`, `/s3`, `/sqs`, `/lambda`, `/sns` and the
  new clients can each be imported on their own.

### Changed

- **The package root is utility-only.** `awpaki` no longer re-exports AWS clients, so bundlers
  such as esbuild stop trying to resolve optional peer dependencies for applications that use
  only parsers, errors, validators, loggers and decoders.
- **`package.json` declares `exports` and `typesVersions`** for the root, the categories and the
  individual client subpaths. Both are needed: with `exports` alone, consumers on
  `moduleResolution: node`/`node10` get working imports and no types.
- **`aws-lambda` types are imported with `import type`**, removing an unnecessary runtime
  dependency.

### Fixed

- **esbuild bundling with optional peer dependencies** — projects importing only utilities no
  longer need the AWS SDK clients installed.

### Tests

- Regression tests asserting the root exports no clients.
- Tests for IoT Core, OpenSearch, SES, CloudWatch, API Gateway, Secrets Manager and Timestream.

---

## [1.4.0] - 2026-02-02

### Added

- **API Gateway V2 support** (HTTP API with payload format 2.0):
  - `logApiGatewayEventV2(event, context)` — reads the V2 structure
    (`requestContext.http.method`, `http.sourceIp`, `http.userAgent`) and logs `routeKey` and
    `cookies` alongside the usual fields.
  - `handleApiGatewayErrorV2(error, cookies?)` — returns
    `APIGatewayProxyStructuredResultV2`, with an optional `cookies` argument for clearing or
    setting cookies on error.
  - `HttpError.toApiGatewayResponseV2(headers?, cookies?)`.

The two payload formats place the same information in different fields — V1 uses
`event.httpMethod`, `event.path` and `requestContext.identity.sourceIp`; V2 uses
`requestContext.http.*` and adds `routeKey` and `cookies` — which is why the V2 functions exist
rather than a runtime branch inside the V1 ones.

### Migration

No breaking changes. `logApiGatewayEvent`, `handleApiGatewayError` and `toApiGatewayResponse`
keep working; use the V2 functions only for HTTP APIs on payload format 2.0.

---

## [1.3.2] - 2026-02-01

### Changed

- **Minimum Node.js lowered from 22.0.0 to 18.0.0** to match the Lambda Node.js 18 LTS runtime.
  Engines specification only, no code change. `@types/node` aligned to `^18`.

### Fixed

- **DevDependencies** — the AWS SDK packages and `async-retry` were added as devDependencies so
  the test suite can run. They remain optional peer dependencies for consumers.

---

## [1.3.1] - 2025-12-13

### Changed

- **`EventSchema` supports nested schemas natively** through the recursive
  `SchemaValue = ParameterConfig | { [key: string]: SchemaValue }`, which allows mixed structures
  such as `{ identity: { sub: {...}, claims: { email: {...} } } }`.
- **Removed `AppSyncEventSchema` and `AppSyncIdentitySchema`** — recursion made the dedicated
  AppSync interfaces unnecessary, cutting roughly 100 lines. AppSync schemas are now ordinary
  nested `EventSchema` objects.

---

## [1.3.0] - 2025-12-13

### Added

- **AppSync support** — `logAppSyncEvent(event, context)` (INFO: operation, `fieldName`,
  identity, identity type, argument keys; DEBUG: arguments, source, request headers, `stash`,
  `prev`) and `handleAppSyncError(error)`, which logs `HttpError` details and **always**
  re-throws, because GraphQL renders thrown errors into its own `errors` array.

### Changed

- **Error handlers log before acting.** `handleApiGatewayError` and `handleGenericError` (and its
  aliases) log the `HttpError` before returning the response, and unknown errors are logged
  before being re-thrown — previously an error could be translated into a response with nothing
  in CloudWatch.

---

## [1.2.1] - 2025-12-13

### Changed

- **`HttpErrorStatus` now references `HttpStatus`** instead of re-declaring the numeric values,
  so the two can never drift apart.
- Added the `HttpErrorStatusType` type for parameter typing.

---

## [1.2.0] - 2025-12-13

### Added

- **Complete `HttpStatus` enum** covering every standard code (1xx, 2xx, 3xx, 4xx, 5xx).
- **`HttpErrorStatus`** — the subset of twelve codes that have a mapped error class (400, 401,
  403, 404, 409, 412, 422, 429, 500, 501, 502, 503).
- **`isValidHttpErrorStatus()`** — validates that a code is a mapped HTTP error.

### Changed

- `isValidHttpStatus()` validates every HTTP code, not only errors.
- `getHttpStatusName()` returns `undefined` for success codes, which have no error class.

### Migration

The split exists because the two enums answer different questions. Use `HttpStatus` for success
responses and `HttpErrorStatus` for the `statusCodeError` field of a schema, where a code with no
error class would be meaningless:

```typescript
// before (v1.1.x)
statusCodeError: HttpStatus.NOT_FOUND;

// after (v1.2.x)
statusCode: HttpStatus.OK;                    // success responses
statusCodeError: HttpErrorStatus.NOT_FOUND;   // schema errors
```

---

## [1.1.0] - 2025-12-09

### Added

- **Decoders module** — validation and transformation functions for use with
  `extractEventParams`: `trimmedString`, `trimmedLowerString`, `alphanumericId`,
  `positiveInteger`, `limitedInteger(min, max)`, `urlEncodedJson`, `jsonString`, `validEmail`,
  `createEnum(values)`, `stringArray`, `stringToBoolean`, `isoDateString`,
  `optionalTrimmedString(default)` and `optionalInteger(default)`.

They exist because query strings and headers only ever carry text: `?active=false` arrives as the
string `'false'`, and `Boolean('false')` is `true`.

---

## [1.0.0] - 2025-12-08

### Added

- **Parsers** — `parseJsonBody<T>()`, with error handling and an optional default value.
- **Errors** — the `HttpError` base class and twelve subclasses (`BadRequest` 400 through
  `ServiceUnavailable` 503), the `HttpStatus` enum, `createHttpError()` and `HTTP_ERROR_MAP`.
- **Extractors** — `extractEventParams()` and the `ParameterType` enum.
- **Loggers** — `logApiGatewayEvent`, `logSqsEvent`, `logSnsEvent`, `logEventBridgeEvent`,
  `logS3Event`, `logDynamoDBStreamEvent`.
- **Error handlers** — `handleApiGatewayError()`, `handleGenericError()` and the per-trigger
  aliases `handleSqsError`, `handleSnsError`, `handleEventBridgeError`, `handleS3Error`,
  `handleDynamoDBStreamError`.

> The original 1.0.0 entry also announced an `isHttpError()` validator and a `normalizeHeaders()`
> transformer. Neither exists in the source history, so they never shipped; they are listed here
> only to explain why older notes mention them. Use `error instanceof HttpError` instead, and the
> `caseInsensitive` flag of a schema field for header matching.

---

## Change categories

**Added** · new features — **Changed** · changes to existing behaviour — **Deprecated** ·
scheduled for removal — **Removed** · removed features — **Fixed** · bug fixes — **Security** ·
vulnerability fixes — **Migration** · instructions for upgrading.
