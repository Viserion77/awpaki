# AWS clients

Thin wrappers over AWS SDK v3 clients. Each one is a module-level singleton, configured from the
environment, exposing `execute(command, retryOptions?)`.

Three things they remove from every service:

- **Client construction.** Region and endpoint resolution is identical in every Lambda and gets
  copy-pasted with subtle differences. Here it happens once, in
  [`environment/`](configuration.md#how-resolution-works).
- **Retry.** Every call goes through `async-retry` with sane defaults, so a throttled DynamoDB
  read or a transient SQS failure does not become a 500.
- **Cold-start cost.** The client is created once per container at module load and reused
  across invocations — a new client per call re-negotiates TLS and re-resolves credentials.

```typescript
import { s3Client } from 'awpaki/clients/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const response = await s3Client.execute(
  new GetObjectCommand({ Bucket: 'my-bucket', Key: 'path/to/file.json' })
);

const data = JSON.parse(await response.Body.transformToString());
```

You still write ordinary AWS SDK commands. The wrapper adds retry and configuration; it does not
invent an API you would have to learn or that would fall behind the SDK.

## Available clients

| Service                    | Export                  | Import from                     | Requires                                          |
| -------------------------- | ----------------------- | ------------------------------- | ------------------------------------------------- |
| DynamoDB (Document Client) | `dynamodbClient`        | `awpaki/clients/dynamodb`       | `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` |
| S3                         | `s3Client`              | `awpaki/clients/s3`             | `@aws-sdk/client-s3`                              |
| SQS                        | `sqsClient`             | `awpaki/clients/sqs`            | `@aws-sdk/client-sqs`                             |
| Lambda                     | `lambdaClient`          | `awpaki/clients/lambda`         | `@aws-sdk/client-lambda`                          |
| SNS                        | `snsClient`             | `awpaki/clients/sns`            | `@aws-sdk/client-sns`                             |
| IoT Core                   | `iotClient`             | `awpaki/clients/iot`            | `@aws-sdk/client-iot`                             |
| OpenSearch                 | `openSearchClient`      | `awpaki/clients/opensearch`     | `@aws-sdk/client-opensearch`                      |
| SES                        | `sesClient`             | `awpaki/clients/ses`            | `@aws-sdk/client-ses`                             |
| CloudWatch                 | `cloudWatchClient`      | `awpaki/clients/cloudwatch`     | `@aws-sdk/client-cloudwatch`                      |
| API Gateway                | `apiGatewayClient`      | `awpaki/clients/apigateway`     | `@aws-sdk/client-api-gateway`                     |
| Secrets Manager            | `secretsManagerClient`  | `awpaki/clients/secretsmanager` | `@aws-sdk/client-secrets-manager`                 |
| Timestream Query           | `timestreamQueryClient` | `awpaki/clients/timestream`     | `@aws-sdk/client-timestream-query`                |
| Timestream Write           | `timestreamWriteClient` | `awpaki/clients/timestream`     | `@aws-sdk/client-timestream-write`                |

### Installing a client

All AWS SDK packages are **optional peer dependencies**, plus `async-retry`, which every client
needs:

```bash
npm install async-retry

npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb  # DynamoDB
npm install @aws-sdk/client-s3                              # S3
npm install @aws-sdk/client-sqs                             # SQS
npm install @aws-sdk/client-lambda                          # Lambda
npm install @aws-sdk/client-sns                             # SNS
npm install @aws-sdk/client-iot                             # IoT Core
npm install @aws-sdk/client-opensearch                      # OpenSearch
npm install @aws-sdk/client-ses                             # SES
npm install @aws-sdk/client-cloudwatch                      # CloudWatch
npm install @aws-sdk/client-api-gateway                     # API Gateway
npm install @aws-sdk/client-secrets-manager                 # Secrets Manager
npm install @aws-sdk/client-timestream-query                # Timestream Query
npm install @aws-sdk/client-timestream-write                # Timestream Write
```

Install only what you import. That is the whole reason the package root does not re-export
clients — see [architecture](architecture.md#packaging-model).

> **Prefer the per-service subpath.** `awpaki/clients` also works and loads each client lazily,
> but a missing SDK there surfaces on first *use* rather than at import. `awpaki/clients/s3`
> fails immediately and names the package, which is a much better error at 3 a.m.

## Examples

**DynamoDB** — the Document Client, so items are plain JavaScript objects rather than
`{ S: '...' }` attribute maps:

```typescript
import { dynamodbClient } from 'awpaki/clients/dynamodb';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

await dynamodbClient.execute(new GetCommand({ TableName: 'Users', Key: { id: '123' } }));

await dynamodbClient.execute(
  new PutCommand({ TableName: 'Users', Item: { id: '123', name: 'John Doe' } })
);

await dynamodbClient.execute(
  new QueryCommand({
    TableName: 'Users',
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': 'john@example.com' },
  })
);
```

**SQS**:

```typescript
import { sqsClient } from 'awpaki/clients/sqs';
import { SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

await sqsClient.execute(
  new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ orderId: '123' }) })
);

const { Messages = [] } = await sqsClient.execute(
  new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 20 })
);

for (const message of Messages) {
  await sqsClient.execute(
    new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle })
  );
}
```

**SNS**:

```typescript
import { snsClient } from 'awpaki/clients/sns';
import { PublishCommand } from '@aws-sdk/client-sns';

await snsClient.execute(
  new PublishCommand({
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:MyTopic',
    Message: JSON.stringify({ event: 'ORDER_CREATED', orderId: '123' }),
    MessageAttributes: { eventType: { DataType: 'String', StringValue: 'ORDER_CREATED' } },
  })
);
```

**The rest** follow the same shape:

```typescript
import { iotClient } from 'awpaki/clients/iot';
import { openSearchClient } from 'awpaki/clients/opensearch';
import { sesClient } from 'awpaki/clients/ses';
import { cloudWatchClient } from 'awpaki/clients/cloudwatch';
import { apiGatewayClient } from 'awpaki/clients/apigateway';
import { secretsManagerClient } from 'awpaki/clients/secretsmanager';
import { timestreamQueryClient, timestreamWriteClient } from 'awpaki/clients/timestream';

await iotClient.execute(new ListThingsCommand({}));
await openSearchClient.execute(new ListDomainNamesCommand({}));
await sesClient.execute(new ListIdentitiesCommand({}));
await cloudWatchClient.execute(new ListMetricsCommand({ Namespace: 'AWS/Lambda' }));
await apiGatewayClient.execute(new GetRestApisCommand({}));
await secretsManagerClient.execute(new GetSecretValueCommand({ SecretId: 'my-secret' }));
await timestreamQueryClient.execute(new QueryCommand({ QueryString: 'SELECT 1' }));
await timestreamWriteClient.execute(new ListDatabasesCommand({}));
```

Timestream is one import with two clients because AWS splits it into two endpoints — which is
also why its endpoint override has a three-level cascade
([configuration](configuration.md#endpoint-overrides)).

## Retry

```typescript
const defaults = { retries: 3, minTimeout: 1000, maxTimeout: 3000 };

await dynamodbClient.execute(command, { retries: 5, minTimeout: 500, maxTimeout: 5000 });
```

The defaults live in a single exported constant (`defaultRetryOptions`, from `awpaki/constants`)
rather than being repeated per client, so changing the policy is one edit and the clients cannot
drift apart.

Override per call rather than globally: a read that a user is waiting on wants to fail fast,
while a write in a queue consumer can afford to keep trying. Timeouts are exponential backoff
bounds handled by `async-retry`.

Retrying is not always right — `retries: 0` for a non-idempotent write, or where a miss is an
expected fast path (see `getCredentialsFromSecret` below).

## `invokeLambda`

Calling another Lambda that expects an API Gateway event means hand-building the event, decoding
a triple-wrapped answer, and remembering that the invoke API reports function failures *in the
success payload*. `lambdaClient.invokeLambda` does all three:

```typescript
import { lambdaClient } from 'awpaki/clients/lambda';

const { statusCode, body } = await lambdaClient.invokeLambda<{ id: string }>({
  functionName: 'users-service-dev-getUser',
  httpMethod: 'GET',
  path: '/users/42',
  resource: '/users/{id}',
  pathParameters: { id: '42' },
  headers: { authorization: 'Bearer token' },
});
```

What it handles:

- **A well-formed synthetic event.** `eventFormat: 'rest'` (default) builds a payload format 1.0
  event with `multiValueHeaders`, `multiValueQueryStringParameters` and a `requestContext`
  complete enough for this library's loggers and extractors. `eventFormat: 'httpApiV2'` builds a
  2.0 event with `routeKey`, `rawPath`, `rawQueryString` and `requestContext.http`.
- **Cascading decode** — bytes → utf-8 → envelope JSON → body JSON, with a fallback at each
  step, so a plain-text or malformed answer comes back as raw text instead of throwing a parse
  error. You get `body`, `payload` and `rawPayload` and can pick your level.
- **Real failure propagation.** A `FunctionError` reported by Lambda becomes a thrown
  `BadGateway` carrying `errorType`/`errorMessage`. This is the classic hole in raw invokes: the
  API returns 200 with the crash hidden inside the payload, so the caller happily processes an
  error object as if it were data. Set `throwOnErrorStatus: true` to do the same for an envelope
  status >= 400.
- **Cross-account calls** through `credentials` — an ephemeral client for that one call, reusing
  the resolved region/endpoint and destroyed afterwards, never replacing the shared client.
- **Observability headers** on every invoke: `x-source-lambda` (`AWS_LAMBDA_FUNCTION_NAME`) and
  `x-trace-id` (`_X_AMZN_TRACE_ID`), when the runtime provides them, so the callee's logs point
  back at the caller.

```typescript
// HTTP API (payload format 2.0), JSON body
await lambdaClient.invokeLambda({
  functionName: 'orders-service-dev-createOrder',
  eventFormat: 'httpApiV2',
  httpMethod: 'POST',
  path: '/orders',
  body: { sku: 'ABC', quantity: 2 },
});
```

`invocationType: 'Event'` fires and forgets (the decoded body is `undefined`); `qualifier`
targets a version or alias; `retryOptions` applies to the `Invoke` call itself.

## Cross-account credentials

```typescript
import { secretsManagerClient } from 'awpaki/clients/secretsmanager';
import { lambdaClient } from 'awpaki/clients/lambda';

const credentials = await secretsManagerClient.getCredentialsFromSecret(
  'arn:aws:secretsmanager:us-east-1:111122223333:secret:partner-account'
);

await lambdaClient.invokeLambda({
  functionName: 'arn:aws:lambda:us-east-1:111122223333:function:partner-api',
  path: '/ping',
  credentials,
});
```

`getCredentialsFromSecret` reads a secret whose `SecretString` is
`{ accessKeyId, secretAccessKey, sessionToken? }` and returns it in exactly the shape
`invokeLambda({ credentials })` expects.

Every failure mode gets a typed error instead of a `TypeError` three frames later: a missing
secret is `NotFound`, and a secret that exists but cannot be used (binary payload, malformed
JSON, missing fields) is `UnprocessableEntity`. **Nothing read from the secret is ever logged.**

Note that the underlying `GetSecretValue` is retried like every other command — pass
`{ retries: 0 }` when a missing secret is an expected fast path.

## Types

`execute` is generic **over the command** and returns exactly what the SDK's own `send` would,
so a call site keeps the typing it would have had without the wrapper — nothing to annotate,
and nothing to annotate wrongly:

```typescript
const response = await dynamodbClient.execute(
  new GetCommand({ TableName: 'Users', Key: { id: '123' } })
);
// response is GetCommandOutput; `response.Itme` is a compile error, not a runtime surprise
```

An object that is not an SDK command no longer type-checks, so a stray argument is caught at
compile time instead of arriving as `any`.

What a document-client read returns is `Record<string, NativeAttributeValue>` — that is all
DynamoDB promises about an item. Narrow it where you read it, rather than by overriding the
command's output type:

```typescript
const { Item } = await dynamodbClient.execute(
  new GetCommand({ TableName: 'Users', Key: { id: '123' } })
);
const user = Item as User | undefined;
```

Passing the output type explicitly (`execute<{ Item: User }>(...)`) no longer compiles: the
type parameter is now the command, not the result. Delete the annotation — the inferred type is
the one the command already carried.

`RetryOptions`, `AwsCommand` and `CommandOutput<C>` are exported from `awpaki/clients` (and
from each client subpath). They live in a shared module that imports no service SDK — only
`@smithy/types`, which is types-only and carries no runtime — so importing them does not pull
DynamoDB's typings into a service that only uses S3.
