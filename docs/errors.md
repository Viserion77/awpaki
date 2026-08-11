# Errors

Two problems, one module. **Throwing**: a business rule fails deep in the call stack and needs
to become a specific HTTP status without threading a return value back up. **Catching**: the
same thrown error must become a different thing depending on the trigger — a response for API
Gateway, a re-throw for SQS, a re-throw for AppSync.

## Throwing

```typescript
import { NotFound, UnprocessableEntity } from 'awpaki';

throw new NotFound(`User ${id} not found`);

throw new UnprocessableEntity('Validation failed', {
  errors: {
    email: 'Invalid email format',
    age: 'Must be 18 or older',
  },
});
```

Every class extends `HttpError` and takes `(message, data?, headers?)`:

| Class                   | Status | Reach for it when                                    |
| ----------------------- | ------ | ---------------------------------------------------- |
| `BadRequest`            | 400    | The request itself is malformed                      |
| `Unauthorized`          | 401    | No credentials, or credentials that do not verify    |
| `Forbidden`             | 403    | Verified caller, insufficient permission             |
| `NotFound`              | 404    | The addressed resource does not exist                |
| `Conflict`              | 409    | The request contradicts the current state            |
| `PreconditionFailed`    | 412    | An `If-Match`-style precondition failed              |
| `UnprocessableEntity`   | 422    | Syntactically valid, semantically wrong — validation |
| `TooManyRequests`       | 429    | Rate limit                                           |
| `InternalServerError`   | 500    | An unexpected failure you chose to surface           |
| `NotImplemented`        | 501    | A route or branch that does not exist yet            |
| `BadGateway`            | 502    | A dependency answered garbage                        |
| `ServiceUnavailable`    | 503    | A dependency is down, retry later                    |

### What an `HttpError` carries

- `statusCode` — the number, also used to pick the response status.
- `data` — anything extra, serialized under `data` in the response body. This is where
  `extractEventParams` puts its per-field error map.
- `headers` — merged into the response (`Retry-After` on a 429, `WWW-Authenticate` on a 401).
- `toApiGatewayResponse(headers?)` / `toApiGatewayResponseV2(headers?, cookies?)` — the
  serialized response, in payload format 1.0 or 2.0.
- `toString()` — name, message and stack, for logs.

The constructed error also **captures Lambda metadata** (`AWS_LAMBDA_FUNCTION_NAME`,
`AWS_LAMBDA_LOG_STREAM_NAME`, `AWS_EXECUTION_ENV`) and emits it in the response body under
`$x-custom-metadata`. That is deliberate: it turns "the API returned 500" into a log stream name
you can open, without correlating timestamps by hand. It is stored as a **non-enumerable**
property so a structured logger does not repeat the whole block on every line.

### Creating an error from a status code

When the status is data rather than a literal — a proxied upstream response, a schema field —
`createHttpError` maps it to the right class:

```typescript
import { createHttpError, HttpStatus } from 'awpaki';

createHttpError(HttpStatus.NOT_FOUND, 'User not found', { userId: 123 }); // NotFound
createHttpError(upstream.status, upstream.message);

createHttpError(418, "I'm a teapot"); // NotImplemented (501)
```

Unmapped codes fall back to `NotImplemented` (501) rather than throwing: an unexpected status
from an upstream service should surface as a server-side problem, not crash the mapping. The
table itself is exported as `HTTP_ERROR_MAP` if you need to inspect it.

## Status codes

Two enums, and the difference matters:

- **`HttpStatus`** — every standard code (1xx…5xx). Use it for **success** responses:
  `statusCode: HttpStatus.CREATED`.
- **`HttpErrorStatus`** — only the twelve codes that have an error class. Use it for
  **`statusCodeError`** in schemas, where a code with no class would be meaningless.

```typescript
import { HttpStatus, HttpErrorStatus } from 'awpaki/constants';

return { statusCode: HttpStatus.NO_CONTENT };

const schema = {
  pathParameters: {
    id: { label: 'User ID', required: true, statusCodeError: HttpErrorStatus.NOT_FOUND },
  },
};
```

`HttpErrorStatus` references `HttpStatus` internally rather than re-declaring the numbers, so
the two can never drift apart.

Three guards come with them:

```typescript
isValidHttpStatus(200);      // true  — any standard code
isValidHttpStatus(999);      // false
isValidHttpErrorStatus(404); // true  — only codes with an error class
isValidHttpErrorStatus(418); // false — standard, but unmapped
getHttpStatusName(404);      // 'NotFound'
getHttpStatusName(200);      // undefined — no error class for success codes
```

<details>
<summary><code>HttpStatus</code> members</summary>

```
1xx  CONTINUE 100 · SWITCHING_PROTOCOLS 101 · PROCESSING 102

2xx  OK 200 · CREATED 201 · ACCEPTED 202 · NON_AUTHORITATIVE_INFORMATION 203 ·
     NO_CONTENT 204 · RESET_CONTENT 205 · PARTIAL_CONTENT 206 · MULTI_STATUS 207 ·
     ALREADY_REPORTED 208 · IM_USED 226

3xx  MULTIPLE_CHOICES 300 · MOVED_PERMANENTLY 301 · FOUND 302 · SEE_OTHER 303 ·
     NOT_MODIFIED 304 · USE_PROXY 305 · TEMPORARY_REDIRECT 307 · PERMANENT_REDIRECT 308

4xx  BAD_REQUEST 400 · UNAUTHORIZED 401 · PAYMENT_REQUIRED 402 · FORBIDDEN 403 ·
     NOT_FOUND 404 · METHOD_NOT_ALLOWED 405 · NOT_ACCEPTABLE 406 ·
     PROXY_AUTHENTICATION_REQUIRED 407 · REQUEST_TIMEOUT 408 · CONFLICT 409 · GONE 410 ·
     LENGTH_REQUIRED 411 · PRECONDITION_FAILED 412 · PAYLOAD_TOO_LARGE 413 ·
     URI_TOO_LONG 414 · UNSUPPORTED_MEDIA_TYPE 415 · RANGE_NOT_SATISFIABLE 416 ·
     EXPECTATION_FAILED 417 · IM_A_TEAPOT 418 · MISDIRECTED_REQUEST 421 ·
     UNPROCESSABLE_ENTITY 422 · LOCKED 423 · FAILED_DEPENDENCY 424 · TOO_EARLY 425 ·
     UPGRADE_REQUIRED 426 · PRECONDITION_REQUIRED 428 · TOO_MANY_REQUESTS 429 ·
     REQUEST_HEADER_FIELDS_TOO_LARGE 431 · UNAVAILABLE_FOR_LEGAL_REASONS 451

5xx  INTERNAL_SERVER_ERROR 500 · NOT_IMPLEMENTED 501 · BAD_GATEWAY 502 ·
     SERVICE_UNAVAILABLE 503 · GATEWAY_TIMEOUT 504 · HTTP_VERSION_NOT_SUPPORTED 505 ·
     VARIANT_ALSO_NEGOTIATES 506 · INSUFFICIENT_STORAGE 507 · LOOP_DETECTED 508 ·
     NOT_EXTENDED 510 · NETWORK_AUTHENTICATION_REQUIRED 511
```

`HttpErrorStatus` is the subset with an error class: 400, 401, 403, 404, 409, 412, 422, 429,
500, 501, 502, 503.

</details>

> **Import path:** prefer `awpaki/constants`. The same symbols are still exported from
> `awpaki/errors` and from the package root — that path is deprecated but **not** going away in
> 1.x, since it is the most used surface of the library after the error classes. Both resolve to
> the same enum object, so identity comparisons keep working while code migrates.

## Error handlers by trigger

The same thrown error means different things to different services, which is why there is one
handler per trigger rather than one generic function:

| Handler                                    | Trigger                  | Returns                   | Behaviour                                        |
| ------------------------------------------ | ------------------------ | ------------------------- | ------------------------------------------------ |
| `handleApiGatewayError(error)`             | API Gateway REST (v1)    | `APIGatewayProxyResult`   | `HttpError` → HTTP response; other errors re-thrown |
| `handleApiGatewayErrorV2(error, cookies?)` | API Gateway HTTP (v2)    | `APIGatewayProxyResultV2` | Same, plus the payload-format-2.0 `cookies` field |
| `handleAppSyncError(error)`                | AppSync                  | `never`                   | Logs, then **always** re-throws — GraphQL formats it |
| `handleSqsError(error)`                    | SQS                      | `void`                    | Re-throws so the message is retried / dead-lettered |
| `handleSnsError(error)`                    | SNS                      | `void`                    | Re-throws                                         |
| `handleEventBridgeError(error)`            | EventBridge              | `void`                    | Re-throws                                         |
| `handleS3Error(error)`                     | S3                       | `void`                    | Re-throws                                         |
| `handleDynamoDBStreamError(error)`         | DynamoDB Streams         | `void`                    | Re-throws                                         |
| `handleGenericError(error)`                | anything, incl. invoke   | `void`                    | The shared implementation the five above alias    |

The rule behind the table: **HTTP triggers translate, everything else re-throws.** API Gateway
expects a response object, so an `HttpError` becomes one. SQS, SNS, S3, EventBridge and DynamoDB
Streams rely on the *invocation failing* to trigger retry and DLQ delivery — swallowing the
error there would silently drop messages. AppSync re-throws because GraphQL renders thrown
errors into its own `errors` array.

Non-`HttpError` values are always re-thrown, on every trigger. An unexpected exception is a bug,
and turning it into a tidy 400 hides it from your alarms.

Every handler logs before acting, through the pluggable logger — so the error line is structured
JSON and survives the [per-invocation buffer](observability.md#per-invocation-log-buffer).

```typescript
import { handleApiGatewayErrorV2, Unauthorized } from 'awpaki';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return { statusCode: 200, body: JSON.stringify(await run(event)) };
  } catch (error) {
    // clear the session cookie when the token is the problem
    const cookies = error instanceof Unauthorized ? ['session=; Max-Age=0'] : undefined;
    return handleApiGatewayErrorV2(error, cookies);
  }
};
```

The handler factories in [handlers](handlers.md) already wire the right handler for you.

## Reading validation errors

`extractEventParams` throws a single `HttpError` carrying every failure under `data.errors`,
keyed by the full path, valued as `[statusCode, message]`:

```typescript
try {
  extractEventParams(schema, event);
} catch (error) {
  if (error instanceof HttpError) {
    console.log(error.data?.errors);
    // { 'body.email': [422, 'Email is required'], 'headers.authorization': [401, 'Authorization is required'] }
  }
}
```

The class is chosen from the failures: one failure uses that field's `statusCodeError`, several
use the highest code among them. See [validation](validation.md#two-behaviours-worth-knowing).
