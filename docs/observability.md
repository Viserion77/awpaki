# Observability

Three layers, usable independently:

1. **Entry loggers** — one per trigger, so the invocation is queryable from the first line.
2. **The pluggable logger** — where those lines go, and how they are formatted.
3. **The per-invocation log buffer** — how to keep the detail without paying for it on every
   successful request.

## The logger

Everything the library emits goes through `getLogger()`. The default implementation writes
**one JSON object per line, directly to `process.stdout`**, and never touches `console.*`.

Two decisions are baked in, and both come from how CloudWatch actually behaves:

**Object first, message second.** `logger.info({ requestId }, 'handler start')`, not
`console.info('handler start', { requestId })`. The `console` form emits an inspected object
glued to a text line, which Logs Insights cannot query by field — `filter requestId = 'abc'`
finds nothing. The object-first form produces top-level, indexable properties.

**`stdout`, not `console`.** Under Lambda Advanced Logging Controls
(`AWS_LAMBDA_LOG_FORMAT=JSON`) the runtime wraps the `console` methods, and a JSON record
emitted through them ends up nested inside a second JSON envelope — field indexing breaks
again. `stdout` is the channel the platform reads in both `Text` and `JSON` modes.

A record looks like this:

```json
{"level":"INFO","time":"2026-08-08T12:00:00.000Z","msg":"handler start","requestId":"abc"}
```

`time` is omitted when `AWS_LAMBDA_LOG_FORMAT=JSON`, because the platform already stamps every
record and paying for the field twice is pure waste. The `level` label matches the AWS
`applicationLogLevel` names (`INFO`/`DEBUG`/`WARN`/`ERROR`) so log-level filtering configured on
the function works on it.

### Plugging your own

```typescript
import { setLogger, setLogSink, resetLogger } from 'awpaki/loggers';

// Replace the implementation — pino, Powertools, Winston, anything with the four methods
setLogger(pinoInstance);

// Or keep the formatting and only redirect the finished line
setLogSink((line) => myTransport.write(line));

resetLogger(); // back to the default — useful between tests
```

The library imposes no logging dependency. Which logger a service uses is an application-level
decision, and a "patterns kit" that forces one wins nothing and costs a bundled package.

The two hooks are independent: `setLogger` replaces everything (a custom logger owns its own
output, so `setLogSink` no longer applies), while `setLogSink` keeps the default JSON formatting
and only changes the destination. The log collector below uses the sink.

`toErrorLog(error)` is exported for the same reason the handlers use it: it passes an `Error`
through untouched — preserving `name`, `message`, `stack`, `cause` and any own property like
`statusCode` — and wraps anything else under `{ err }`, so a thrown string still lands as valid
structured data.

## Entry loggers by trigger

Call one at the top of the handler. Each knows which fields of its event are worth indexing:

| Logger                            | INFO carries                                            | DEBUG adds              |
| --------------------------------- | ------------------------------------------------------- | ----------------------- |
| `logApiGatewayEvent(e, c, cfg?)`  | method, path, resource, stage, sourceIp, userAgent, apiId, query and path params | all headers |
| `logApiGatewayEventV2(e, c, cfg?)`| the same plus `routeKey` and `cookies`                   | all headers             |
| `logSqsEvent(e, c, cfg?)`         | record count, then one line per record with `messageId` and queue ARN | each full body |
| `logSnsEvent(e, c, cfg?)`         | record count, topic ARN, subject, message id             | each full message       |
| `logEventBridgeEvent(e, c, cfg?)` | source, detail-type, account, region, resources          | the full `detail`       |
| `logS3Event(e, c, cfg?)`          | one line per object: bucket, key (URL-decoded), size, etag, eventName | —         |
| `logDynamoDBStreamEvent(e, c, cfg?)` | one line per record: eventName, table, key names     | full old/new images     |
| `logAppSyncEvent(e, c, cfg?)`     | operation, fieldName, parent type, identity, argument keys | arguments, source, headers, stash, prev |

The INFO/DEBUG split is the point: INFO is what you want on every invocation forever, DEBUG is
what you want while diagnosing one. Payloads, headers and full message bodies are DEBUG because
they are large, frequently sensitive, and useless in aggregate.

```typescript
import { logSqsEvent } from 'awpaki';

export const handler: SQSHandler = async (event, context) => {
  logSqsEvent(event, context, {
    additionalData: { correlationId: event.Records[0]?.messageAttributes?.correlationId?.stringValue },
  });
};
```

`additionalData` is merged into the INFO record — the place for a correlation id, a tenant, a
feature flag.

The handler factories call the right logger for you; pass `logConfig` to reach `additionalData`
through them.

### Filtering verbosity

There is no `LOG_LEVEL` variable to set. Filtering belongs to the platform, configured on the
function rather than in code, so it can be changed without a deploy:

```yaml
# serverless.yml / SAM
functions:
  myFunction:
    loggingConfig:
      logFormat: JSON
      applicationLogLevel: INFO # switch to DEBUG to see payloads
      systemLogLevel: WARN
```

## Per-invocation log buffer

The expensive part of CloudWatch is ingestion and retention, and most of what you ingest is
context for failures that never happen. `withRuntimeLogCollector` keeps that context in memory
and ships it **only when the invocation goes wrong**:

```typescript
import { getLogger, withRuntimeLogCollector } from 'awpaki/loggers';

export const handler = withRuntimeLogCollector(
  async (event: APIGatewayProxyEventV2) => {
    getLogger().info({ path: event.rawPath }, 'request received'); // buffered
    return { statusCode: 200, body: '{}' };                        // buffer dropped
  },
  {
    releaseOn: 'error',
    trackingKey: { resolveKey: (e) => e.headers['x-tenant-id'], fallbackKey: 'untracked' },
  }
);
```

Wrap it as the **outermost** layer, so every other middleware logs inside the buffer.

What makes it safe in a real Lambda — each of these is a failure mode a naive buffer has:

- **Concurrent invocations never mix.** The buffer lives in an `AsyncLocalStorage` store, so
  parallel invocations in the same container, and every `await` chain inside one, keep their own
  lines.
- **`WARN` is a fixed pass-through band.** It is emitted immediately and never buffered — a
  warning you only see when something *else* fails is not a warning.
- **Timeouts still produce logs.** A flush is scheduled 2 s before the deadline reported by
  `context.getRemainingTimeInMillis()`. A Lambda timeout kills the runtime without running
  `finally`, which is exactly the case where you most want the buffer.
- **No duplicates.** The flush is idempotent, so the pre-timeout timer and the `finally` cannot
  emit the same line twice, and the timer is cleared in the `finally` so it never holds the
  invocation open.
- **`context` is optional.** Handlers invoked directly (offline, unit tests) work the same,
  minus the timer.

`ERROR` is always emitted. `releaseOn: 'warn'` makes a warning open the buffer too; a thrown
handler always opens it, whatever the setting.

The collector installs its own sink via `setLogSink`, so it only sees lines from the built-in
logger — a logger installed with `setLogger` owns its output and is not intercepted. Use the
`output` option to send the released lines somewhere other than `process.stdout`.

### Attribution lines

`trackingKey` emits one line per invocation **outside** the buffer, always, whatever the
outcome:

```json
{"level":"INFO","msg":"invocation tracking","trackingKey":"tenant-42"}
```

That is what makes a per-tenant cost or usage map possible while the rest of the invocation
stays silent. `resolveKey` runs once before the handler; returning nothing falls back to
`fallbackKey` (omit it and an unattributed invocation emits no line at all). For a batch
touching several tenants, call `addTrackingKey(key)` from inside the handler — each distinct key
produces its own line.

The `msg` is the exported constant `TRACKING_LOG_MESSAGE`, stable on purpose: it is what a Logs
Insights query filters on.

### Wiring it into the factories

The handler factories do not import the collector — a handler must keep working with none
installed. Register it once at bootstrap and every factory-built handler picks it up:

```typescript
import { setHandlerLogCollector } from 'awpaki/handlers';
import { withRuntimeLogCollector } from 'awpaki/loggers';

setHandlerLogCollector((handler) => withRuntimeLogCollector(handler, { releaseOn: 'error' }));
```

The collector is resolved **per invocation**, not when the handler is created, so registering it
after the handlers were built (they are usually built at module scope) still works. Individual
handlers can override it with the `logCollector` option, and `resetHandlerLogCollector()`
removes it.
