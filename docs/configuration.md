# Configuration

Every environment variable the library reads, and what happens when it is not set. This is the
only place these tables live; other pages link here.

The short version: **in AWS Lambda you configure nothing.** The runtime already sets what the
clients need. These variables exist for local development, containers, and CI.

## AWS client configuration

| Variable                            | Purpose                                          | Default / fallback            |
| ----------------------------------- | ------------------------------------------------ | ----------------------------- |
| `AWS_REGION`                        | Region for every client                          | set by the Lambda runtime     |
| `AWS_DEFAULT_REGION`                | Region fallback                                  | used when `AWS_REGION` is unset |
| `AWS_ENDPOINT_URL`                  | Global endpoint override (LocalStack, MinIO, …)  | —                             |
| `AWS_ENDPOINT_URL_DYNAMODB`         | DynamoDB endpoint                                | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_S3`               | S3 endpoint                                      | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_SQS`              | SQS endpoint                                     | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_LAMBDA`           | Lambda endpoint                                  | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_SNS`              | SNS endpoint                                     | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_IOT`              | IoT Core endpoint                                | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_OPENSEARCH`       | OpenSearch endpoint                              | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_SES`              | SES endpoint                                     | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_CLOUDWATCH`       | CloudWatch endpoint                              | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_API_GATEWAY`      | API Gateway endpoint                             | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_SECRETS_MANAGER`  | Secrets Manager endpoint                         | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_TIMESTREAM`       | Both Timestream endpoints                        | `AWS_ENDPOINT_URL`            |
| `AWS_ENDPOINT_URL_TIMESTREAM_QUERY` | Timestream Query endpoint                        | `AWS_ENDPOINT_URL_TIMESTREAM` |
| `AWS_ENDPOINT_URL_TIMESTREAM_WRITE` | Timestream Write endpoint                        | `AWS_ENDPOINT_URL_TIMESTREAM` |

Credentials are **never** read by this library. The AWS SDK resolves them through its own chain
(execution role, profile, IMDS), which is what you want — a library that read
`AWS_SECRET_ACCESS_KEY` itself would break every role-based deployment.

### Endpoint overrides

The two-level cascade (`AWS_ENDPOINT_URL_S3` → `AWS_ENDPOINT_URL`) exists so a single variable
points every service at LocalStack, while one service can still be redirected on its own —
running against real S3 with everything else emulated, for instance.

Timestream has three levels because AWS splits it into separate query and write endpoints: the
operation-specific variable, then the shared Timestream one, then the global one.

### Stage

| Variable   | Purpose                    | Precedence     |
| ---------- | -------------------------- | -------------- |
| `STAGE`    | Deployment stage name      | highest        |
| `NODE_ENV` | Stage fallback             | second         |
| —          | `DEFAULT_STAGE` (`'dev'`)  | last           |

`STAGE` wins because it is what deployment tooling (Serverless Framework, SAM, CDK) sets to name
the environment, while `NODE_ENV` is routinely forced to `production` by bundlers and runtimes
regardless of which stage is being deployed. Trusting `NODE_ENV` first would label a staging
deploy as production.

`resolveStage()` always returns a string — there is no meaningful "no stage" state, so callers
never need a null check.

## Lambda runtime variables

Set by AWS, read by the library, never set by you:

| Variable                     | Read by                    | Used for                                          |
| ---------------------------- | -------------------------- | ------------------------------------------------- |
| `AWS_LAMBDA_FUNCTION_NAME`   | `HttpError`, `invokeLambda`| Error metadata; the `x-source-lambda` header       |
| `AWS_LAMBDA_LOG_STREAM_NAME` | `HttpError`                | Error metadata — jump straight to the log stream   |
| `AWS_EXECUTION_ENV`          | `HttpError`                | Error metadata (runtime identification)            |
| `AWS_LAMBDA_LOG_FORMAT`      | the logger                 | Drops the `time` field when the platform stamps it |
| `_X_AMZN_TRACE_ID`           | `invokeLambda`             | Propagates the X-Ray trace as `x-trace-id`         |

The first three end up in the error response body under `$x-custom-metadata` — see
[errors](errors.md#what-an-httperror-carries).

There is **no** `LOG_LEVEL` variable. Log verbosity is configured on the function through Lambda
Advanced Logging Controls, not in code — see
[observability](observability.md#filtering-verbosity).

## How resolution works

Three functions in `awpaki/environment` implement all of the above, and they are exported
because the same rules apply to clients you build yourself:

```typescript
import { resolveRegion, resolveEndpoint, resolveStage } from 'awpaki/environment';

new S3Client({
  region: resolveRegion(),
  endpoint: resolveEndpoint('AWS_ENDPOINT_URL_S3'),
});

resolveEndpoint('AWS_ENDPOINT_URL_TIMESTREAM_QUERY', 'AWS_ENDPOINT_URL_TIMESTREAM');
```

Two rules they share, both learned from the `||` chains they replaced:

- **An empty string counts as absent** and falls through to the next candidate. `AWS_REGION=''`
  set by a misconfigured shell should not win over `AWS_DEFAULT_REGION`.
- **Nothing configured returns `undefined`**, not `''`. Passing an empty string to an SDK client
  overrides its resolution chain with a bogus value; `undefined` lets the SDK fall back to the
  shared config file, IMDS and the rest.

`resolveEndpoint` always appends `AWS_ENDPOINT_URL` as the final candidate, so callers never
repeat it.

## Local development

```bash
# .env — everything against LocalStack
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566

# or per service
AWS_ENDPOINT_URL_DYNAMODB=http://localhost:4566
AWS_ENDPOINT_URL_S3=http://localhost:4566
```

In production, AWS Lambda sets `AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`,
`AWS_LAMBDA_LOG_STREAM_NAME` and `AWS_EXECUTION_ENV` for you. No additional configuration is
needed.
