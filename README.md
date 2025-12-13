# awpaki

AWS Patterns Kit - A utility library for AWS patterns

## Description

A TypeScript utility library that provides helper functions for common AWS patterns and operations. The library is organized into modular categories for easy discoverability and usage.

## Installation

```bash
npm install awpaki
```

## Requirements

- Node.js >= 22.0.0

## Features

- 📦 **TypeScript Support**: Full TypeScript support with type definitions
- 🧪 **Well Tested**: Comprehensive test coverage with Jest (188 tests passing)
- 📝 **JSDoc Documentation**: Complete JSDoc documentation for all functions
- 🚀 **Easy to Use**: Simple and intuitive API
- 🗂️ **Modular Architecture**: Organized by feature categories (parsers, errors, extractors, validators, transformers, loggers, decoders)
- 📚 **Flexible Imports**: Import from root or specific categories
- 🔒 **Type Safety**: Enums for HTTP status codes and parameter types
- 📊 **Lambda Logging**: Built-in event logging for production tracking
- ✅ **Validation Decoders**: 17 battle-tested decoders for common validation patterns

## Usage

The library is organized into categories for better organization:

- **parsers/**: Data parsing utilities (JSON, etc.)
- **errors/**: Custom error classes and error handling
- **extractors/**: Parameter and data extraction utilities
- **validators/**: Input validation functions
- **transformers/**: Data transformation utilities
- **decoders/**: Validation and transformation decoders for extractEventParams

### Import Options

```typescript
// Option 1: Import from root (recommended)
import { parseJsonBody } from 'awpaki';

// Option 2: Import from specific category
import { parseJsonBody } from 'awpaki/parsers';

// Option 3: Import entire category as namespace
import * as parsers from 'awpaki/parsers';
```

### AWS Lambda Handler Types

AWS provides official TypeScript types for all Lambda handlers via `@types/aws-lambda`. Use these types instead of manually typing events and return values:

```typescript
import { 
  // API Gateway
  APIGatewayProxyHandler,           // event: APIGatewayProxyEvent → APIGatewayProxyResult
  APIGatewayProxyHandlerV2,         // HTTP API (v2)
  
  // SQS
  SQSHandler,                        // event: SQSEvent → SQSBatchResponse | void
  
  // SNS  
  SNSHandler,                        // event: SNSEvent → void
  
  // DynamoDB Streams
  DynamoDBStreamHandler,             // event: DynamoDBStreamEvent → DynamoDBBatchResponse | void
  
  // S3
  S3Handler,                         // event: S3Event → void
  S3BatchHandler,                    // S3 Batch Operations
  
  // EventBridge
  EventBridgeHandler,                // Generic EventBridge handler
  ScheduledHandler,                  // CloudWatch Events/cron
  
  // Others
  ALBHandler,                        // Application Load Balancer
  CloudFrontRequestHandler,          // CloudFront
  // ... many more available
} from 'aws-lambda';

// Usage example
export const myHandler: SQSHandler = async (event, context) => {
  // event is typed as SQSEvent
  // context is typed as Context
  // return type is SQSBatchResponse | void
};
```

**Benefits:**
- ✅ Automatic type inference for event and context
- ✅ Type-safe return values
- ✅ No need to manually import event types
- ✅ Better IDE autocomplete and error checking

**Quick Reference:**

| Handler Type | Event Type | Return Type | Use Case |
|---|---|---|---|
| `APIGatewayProxyHandler` | `APIGatewayProxyEvent` | `APIGatewayProxyResult` | REST API |
| `APIGatewayProxyHandlerV2` | `APIGatewayProxyEventV2` | `APIGatewayProxyResultV2` | HTTP API (v2) |
| `AppSyncResolverHandler<TArgs, TResult>` | `AppSyncResolverEvent<TArgs>` | `TResult \| Promise<TResult>` | AppSync GraphQL |
| `SQSHandler` | `SQSEvent` | `SQSBatchResponse \| void` | Message queues |
| `SNSHandler` | `SNSEvent` | `void` | Pub/sub notifications |
| `DynamoDBStreamHandler` | `DynamoDBStreamEvent` | `DynamoDBBatchResponse \| void` | Database streams |
| `S3Handler` | `S3Event` | `void` | Object storage events |
| `EventBridgeHandler<T, D, R>` | `EventBridgeEvent<T, D>` | `R` | Custom events |
| `ScheduledHandler<T>` | `ScheduledEvent<T>` | `void` | Cron/scheduled |
| `ALBHandler` | `ALBEvent` | `ALBResult` | Load balancer |

**Response Types:**

```typescript
// API Gateway - Must return proper structure
APIGatewayProxyResult: {
  statusCode: number;
  headers?: { [key: string]: string };
  body: string;  // Must be JSON stringified
}

// SQS - Optional batch failure reporting
SQSBatchResponse: {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

// DynamoDB - Optional batch failure reporting  
DynamoDBBatchResponse: {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

// SNS, S3, EventBridge - No return value (void)
```

## Quick Start Examples

### Complete Lambda Handler Example

This example demonstrates all the key patterns from the library:

```typescript
import { 
  // Logging
  logApiGatewayEvent,
  
  // Parameter extraction & validation
  extractEventParams, 
  ParameterType,
  
  // Error handling
  handleApiGatewayError,
  NotFound,
  HttpStatus,
  HttpErrorStatus,
  
  // Type safety
  HttpError
} from 'awpaki';
import { APIGatewayProxyHandler } from 'aws-lambda';

/**
 * Example: Update user profile
 * GET /users/{userId}
 * PUT /users/{userId}
 */
export const handler: APIGatewayProxyHandler = async (event, context) => {
  // 1️⃣ Log incoming event for debugging
  // AWS will filter logs based on Lambda configuration (info/debug)
  logApiGatewayEvent(event, context);
  
  try {
    // 2️⃣ Extract and validate all parameters with type safety
    const params = extractEventParams({
      // Path parameters (from URL)
      pathParameters: {
        userId: {
          label: 'User ID',
          required: true,
          expectedType: ParameterType.STRING,
          statusCodeError: HttpErrorStatus.NOT_FOUND, // 404 if missing
        },
      },
      
      // Headers (authentication, content-type, etc)
      headers: {
        authorization: {
          label: 'Authorization',
          required: true,
          caseInsensitive: true, // Matches Authorization, authorization, AUTHORIZATION
          statusCodeError: HttpErrorStatus.UNAUTHORIZED, // 401 if missing
        },
        'content-type': {
          label: 'Content-Type',
          default: 'application/json',
        },
      },
      
      // Request body (for POST/PUT/PATCH)
      body: {
        name: {
          label: 'Name',
          required: true,
          expectedType: ParameterType.STRING,
        },
        email: {
          label: 'Email',
          required: true,
          expectedType: ParameterType.STRING,
          decoder: (value: string) => {
            // Custom validation/transformation
            if (!value.includes('@')) {
              throw new Error('Invalid email format');
            }
            return value.toLowerCase();
          },
        },
        age: {
          label: 'Age',
          expectedType: ParameterType.NUMBER,
          default: 18, // Optional with default
        },
        tags: {
          label: 'Tags',
          expectedType: ParameterType.ARRAY,
          default: [],
        },
      },
      
      // Query string parameters
      queryStringParameters: {
        includeDetails: {
          label: 'Include Details',
          expectedType: ParameterType.BOOLEAN,
          default: false,
        },
      },
    }, event);
    
    // 3️⃣ Business logic with validated parameters
    // All params are now type-safe and validated
    const token = params.authorization.replace('Bearer ', '');
    
    // Simulate database lookup
    const existingUser = await getUserById(params.userId);
    if (!existingUser) {
      // Throw type-safe HTTP errors
      throw new NotFound(`User ${params.userId} not found`);
    }
    
    // Update user
    const updatedUser = await updateUser(params.userId, {
      name: params.name,
      email: params.email, // Already normalized by decoder
      age: params.age,
      tags: params.tags,
    });
    
    // 4️⃣ Return success response
    return {
      statusCode: HttpStatus.OK, // Type-safe status code
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        data: params.includeDetails 
          ? { ...updatedUser, metadata: { updatedAt: new Date().toISOString() } }
          : updatedUser,
      }),
    };
    
  } catch (error) {
    // 5️⃣ Centralized error handling
    // Converts HttpError to proper API Gateway response
    // Re-throws non-HTTP errors for Lambda retry/DLQ
    return handleApiGatewayError(error);
  }
};

// Mock functions (replace with your actual implementation)
async function getUserById(userId: string) {
  // Your database logic
  return { id: userId, name: 'John Doe' };
}

async function updateUser(userId: string, data: any) {
  // Your database logic
  return { id: userId, ...data };
}
```

### Event Loggers por Tipo de Trigger

Cada tipo de evento Lambda tem um logger específico que extrai informações relevantes:

| Logger Function | Event Type | Info Logged | Debug Logged |
|---|---|---|---|
| `logApiGatewayEvent(event, context)` | API Gateway | HTTP method, path, user agent | All headers, query params, body |
| `logSqsEvent(event, context)` | SQS | Queue name, record count | Full message bodies |
| `logSnsEvent(event, context)` | SNS | Topic ARN, subject, record count | Full message content |
| `logEventBridgeEvent(event, context)` | EventBridge | Source, detail-type, account | Full event detail |
| `logS3Event(event, context)` | S3 | Bucket, object key, event type | Object size, etag |
| `logDynamoDBStreamEvent(event, context)` | DynamoDB Streams | Table name, event types, keys | Full old/new images |
| `logAppSyncEvent(event, context)` | AppSync | Operation, field name, identity | Full arguments, source, headers |

**Uso:**
```typescript
import { logSqsEvent, logSnsEvent, logS3Event } from 'awpaki';

// SQS Handler
export const sqsHandler: SQSHandler = async (event, context) => {
  logSqsEvent(event, context);
  // Logs: "SQS Event: queue=my-queue records=10"
  // ...
};

// SNS Handler
export const snsHandler: SNSHandler = async (event, context) => {
  logSnsEvent(event, context);
  // Logs: "SNS Event: topic=arn:aws:sns:...:my-topic subject=Alert records=1"
  // ...
};

// S3 Handler
export const s3Handler: S3Handler = async (event, context) => {
  logS3Event(event, context);
  // Logs: "S3 Event: bucket=my-bucket key=folder/file.jpg eventName=ObjectCreated:Put"
  // ...
};
```

### Error Handlers por Tipo de Trigger

Cada tipo de trigger precisa de um error handler específico:

| Error Handler | Event Type | Return Type | Comportamento |
|---|---|---|---|
| `handleApiGatewayError(error)` | API Gateway | `APIGatewayProxyResult` | Retorna response HTTP com statusCode |
| `handleAppSyncError(error)` | AppSync | `never` | Loga e re-lança erro (GraphQL formata) |
| `handleSqsError(error)` | SQS | `void` | Re-lança erro para retry/DLQ |
| `handleSnsError(error)` | SNS | `void` | Re-lança erro para retry/DLQ |
| `handleEventBridgeError(error)` | EventBridge | `void` | Re-lança erro para retry/DLQ |
| `handleS3Error(error)` | S3 | `void` | Re-lança erro para retry/DLQ |
| `handleDynamoDBStreamError(error)` | DynamoDB Streams | `void` | Re-lança erro para retry/DLQ |
| `handleGenericError(error)` | Qualquer | `void` | Alias genérico (mesma lógica) |

**Diferenças:**

- **API Gateway**: Converte `HttpError` em response HTTP formatado. Não re-lança.
- **AppSync**: Loga detalhes do erro e sempre re-lança para GraphQL formatar no array `errors`.
- **Outros triggers**: Re-lançam erros não-HTTP para acionar retry/DLQ do AWS Lambda.

**Uso:**
```typescript
import { 
  handleSqsError, 
  handleDynamoDBStreamError,
  BadRequest 
} from 'awpaki';

// SQS Handler
export const sqsHandler: SQSHandler = async (event, context) => {
  try {
    // Process messages
    for (const record of event.Records) {
      const body = JSON.parse(record.body);
      await processMessage(body);
    }
  } catch (error) {
    return handleSqsError(error); // Re-throws for retry
  }
};

// DynamoDB Stream Handler com batch failures
export const streamHandler: DynamoDBStreamHandler = async (event, context) => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  
  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Failed record:', record.eventID, error);
      batchItemFailures.push({ 
        itemIdentifier: record.dynamodb?.SequenceNumber || '' 
      });
    }
  }
  
  // Return failed items for retry (type-safe)
  return { batchItemFailures };
};
```

**Observação:** Todos os handlers SQS/SNS/EventBridge/S3/DynamoDB são **aliases** de `handleGenericError`. Use o que for mais semântico para seu caso.


### AppSync Resolver Example

AppSync Lambda resolvers receive GraphQL context and return typed results. The library provides **native AppSync support** with `AppSyncEventSchema`:

```typescript
import { 
  extractEventParams,
  logAppSyncEvent,
  handleAppSyncError,
  AppSyncEventSchema,
  ParameterType,
  NotFound,
  HttpErrorStatus,
  validEmail,
  trimmedString
} from 'awpaki';
import { AppSyncResolverHandler } from 'aws-lambda';

// Define your GraphQL types
interface GetUserArgs {
  id: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

// AppSync resolver handler with typed arguments and result
export const getUserResolver: AppSyncResolverHandler<GetUserArgs, User> = async (event, context) => {
  // Log AppSync event with operation details
  logAppSyncEvent(event, context);
  
  try {
    // Native AppSync schema - extracts from arguments, identity, and identity.claims
    const params = extractEventParams<{
      id: string;
      sub: string;
      email: string;
    }>({
      // GraphQL arguments
      arguments: {
        id: {
          label: 'User ID',
          required: true,
          expectedType: ParameterType.STRING,
          statusCodeError: HttpErrorStatus.BAD_REQUEST,
        },
      },
      // Cognito identity with nested claims
      identity: {
        sub: {
          label: 'Caller ID',
          required: true,
          statusCodeError: HttpErrorStatus.UNAUTHORIZED,
        },
        claims: {
          email: {
            label: 'Caller Email',
            required: true,
            decoder: validEmail,
          },
        },
      },
    } as AppSyncEventSchema, event);
    
    // Authorization check
    if (params.sub !== params.id) {
      throw new NotFound('Unauthorized to access this user');
    }
    
    // Fetch user from database
    const user = await getUserById(params.id);
    
    if (!user) {
      throw new NotFound(`User ${params.id} not found`);
    }
    
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
    
  } catch (error) {
    // Logs HttpError and re-throws for GraphQL to format
    return handleAppSyncError(error);
  }
};

// Mutation example with nested input validation
interface CreateUserArgs {
  input: {
    name: string;
    email: string;
  };
}

export const createUserResolver: AppSyncResolverHandler<CreateUserArgs, User> = async (event, context) => {
  logAppSyncEvent(event, context);
  
  try {
    // For mutations with nested input, map to arguments
    const params = extractEventParams<{ name: string; email: string }>({
      arguments: {
        name: {
          label: 'Name',
          required: true,
          expectedType: ParameterType.STRING,
          decoder: trimmedString,
        },
        email: {
          label: 'Email',
          required: true,
          expectedType: ParameterType.STRING,
          decoder: validEmail,
        },
      },
    } as AppSyncEventSchema, {
      // Flatten input to arguments
      ...event,
      arguments: event.arguments.input || {},
    });
    
    // Create user with validated data
    const user = await createUser({
      name: params.name,
      email: params.email,
    });
    
    return user;
    
  } catch (error) {
    throw error; // AppSync will format as GraphQL error
  }
};

// Nested resolver example (field resolver)
interface Post {
  id: string;
  title: string;
  authorId: string;
}

interface PostAuthorArgs {
  // No arguments for this field
}

// Resolver for Post.author field
export const postAuthorResolver: AppSyncResolverHandler<PostAuthorArgs, User> = async (event) => {
  // event.source contains the parent Post object
  const post = event.source as Post;
  
  console.debug('Resolving author for post', { postId: post.id, authorId: post.authorId });
  
  const author = await getUserById(post.authorId);
  
  if (!author) {
    throw new NotFound(`Author ${post.authorId} not found`);
  }
  
  return author;
};

// Mock functions (replace with your actual implementation)
async function getUserById(id: string): Promise<User | null> {
  // Your database logic
  return null;
}

async function createUser(data: { name: string; email: string }): Promise<User> {
  // Your database logic
  return { id: '123', ...data };
}
```

**AppSync Event Structure:**
```typescript
{
  arguments: TArgs,              // GraphQL query/mutation arguments
  identity: {                    // Caller identity
    sub: string,                 // User ID (Cognito)
    username?: string,
    claims?: Record<string, any>,
    sourceIp?: string[],
  },
  source: TSource,               // Parent object (for nested resolvers)
  request: {
    headers: Record<string, string>,
  },
  info: {
    fieldName: string,           // GraphQL field being resolved
    parentTypeName: string,      // Parent type (Query, Mutation, etc)
    variables: Record<string, any>,
  },
  prev: {                        // Previous resolver result (pipeline)
    result: any,
  },
  stash: Record<string, any>,    // State shared across pipeline resolvers
}
```

### Lambda Event Logging

AWS-native logging for all Lambda trigger types. Emits structured logs at appropriate levels:

- **console.info()** - Event summaries and metadata (always relevant)
- **console.debug()** - Full payloads and detailed data (verbose mode only)

AWS Lambda automatically filters logs based on your configuration. No environment variables needed in your code.

```typescript
import { 
  logApiGatewayEvent, 
  logSqsEvent, 
  logSnsEvent, 
  logEventBridgeEvent,
  logS3Event,
  logDynamoDBStreamEvent 
} from 'awpaki';
import { 
  APIGatewayProxyHandler,
  SQSHandler,
  SNSHandler,
  EventBridgeHandler,
  S3Handler,
  DynamoDBStreamHandler
} from 'aws-lambda';

// API Gateway - Logs request metadata + headers (debug)
export const apiHandler: APIGatewayProxyHandler = async (event, context) => {
  logApiGatewayEvent(event, context);
  // Info: { httpMethod, path, stage, sourceIp, requestId }
  // Debug: Full headers object
};

// SQS - Logs record count + truncated body (info), full body (debug)
export const sqsHandler: SQSHandler = async (event, context) => {
  logSqsEvent(event, context);
  // Info: { recordCount, messageIds, body: '...first 100 chars...' }
  // Debug: { body: 'full message', receiptHandle }
};

// SNS - Logs topic + truncated message (info), full message (debug)
export const snsHandler: SNSHandler = async (event, context) => {
  logSnsEvent(event, context);
  // Info: { topicArn, subject, message: '...first 100 chars...' }
  // Debug: { message: 'full message content' }
};

// EventBridge - Logs event metadata + detail keys (info), full detail (debug)
export const eventBridgeHandler: EventBridgeHandler<string, any, void> = async (event, context) => {
  logEventBridgeEvent(event, context);
  // Info: { source, detailType, detailKeys: 'key1, key2, key3' }
  // Debug: { detail: { full detail object } }
};

// S3 - Logs object metadata (info only, simple enough)
export const s3Handler: S3Handler = async (event, context) => {
  logS3Event(event, context);
  // Info: { bucketName, objectKey, objectSize, eventName }
};

// DynamoDB - Logs keys as strings (info), full objects (debug)
export const dynamoHandler: DynamoDBStreamHandler = async (event, context) => {
  logDynamoDBStreamEvent(event, context);
  // Info: { eventName, keys: 'id, email', newImageKeys: 'id, name, email' }
  // Debug: { Keys: { full object }, NewImage: { full object } }
}

// Add custom metadata to any logger
logApiGatewayEvent(event, context, {
  additionalData: {
    customField: 'customValue',
    correlationId: event.headers['x-correlation-id'],
  },
});
```

**CloudWatch Configuration:**

Configure log filtering in your Lambda/CloudWatch, not in code:

```yaml
# serverless.yml or SAM template
functions:
  myFunction:
    environment:
      # AWS uses this for log filtering (not read by awpaki)
      AWS_LAMBDA_LOG_LEVEL: DEBUG  # or INFO (default)
```

### parseJsonBody

Parses a JSON stringified body with support for null handling, default values, and validation.

```typescript
import { parseJsonBody, BadRequest } from 'awpaki';

// Basic parsing
const user = parseJsonBody<User>('{"name": "John", "age": 30}');

// Body is required by default
try {
  const body = parseJsonBody<Body>(event.body);
} catch (error) {
  if (error instanceof BadRequest) {
    return error.toLambdaResponse();
  }
}

// Make body optional with default value
const data = parseJsonBody<Data>(event.body, { defaultValue: { count: 0 } });
```

### extractEventParams

Extract and validate parameters from AWS Lambda events with comprehensive validation and multiple error collection.

```typescript
import { extractEventParams, UnprocessableEntity } from 'awpaki';

// Define schema
const schema = {
  pathParameters: {
    id: {
      label: 'User ID',
      required: true,
      expectedType: 'string'
    }
  },
  body: {
    email: {
      label: 'Email',
      required: true,
      expectedType: 'string'
    },
    age: {
      label: 'Age',
      expectedType: 'number',
      default: 18
    }
  },
  headers: {
    authorization: {
      label: 'Authorization',
      required: true,
      caseInsensitive: true,
      statusCodeError: 401
    }
  }
};

// Extract and validate
try {
  const params = extractEventParams<{
    id: string;
    email: string;
    age: number;
    authorization: string;
  }>(schema, event);
} catch (error) {
  if (error instanceof UnprocessableEntity) {
    // Multiple errors collected in errors object
    console.log(error.errors);
    // { 'body.email': 'Email is required', 'body.age': 'Age must be a number' }
    return error.toLambdaResponse();
  }
}
```

### Custom HTTP Errors

Comprehensive HTTP error classes with Lambda integration and multiple error support.

```typescript
import {
  BadRequest,
  Unauthorized,
  UnprocessableEntity,
  NotFound
} from 'awpaki';

// Single error
throw new BadRequest('Invalid input');

// Multiple validation errors
throw new UnprocessableEntity('Validation failed', {
  email: 'Invalid email format',
  age: 'Must be 18 or older',
  password: 'Must be at least 8 characters'
});

// With Lambda response
try {
  // your code
} catch (error) {
  if (error instanceof HttpError) {
    return error.toLambdaResponse();
    // Returns proper API Gateway response with status code
  }
}
```

### Decoders

Decoders are validation and transformation functions that work with `extractEventParams` to ensure parameter quality. They validate inputs and transform them into the expected format:

```typescript
import { 
  extractEventParams,
  ParameterType,
  validEmail,
  trimmedString,
  positiveInteger,
  createEnum,
  stringToBoolean,
  optionalTrimmedString
} from 'awpaki';
import { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event) => {
  const params = extractEventParams({
    body: {
      email: {
        label: 'Email',
        required: true,
        expectedType: ParameterType.STRING,
        decoder: validEmail, // Validates format and normalizes to lowercase
      },
      name: {
        label: 'Name', 
        required: true,
        expectedType: ParameterType.STRING,
        decoder: trimmedString, // Removes whitespace and validates non-empty
      },
      age: {
        label: 'Age',
        required: true,
        expectedType: ParameterType.NUMBER,
        decoder: positiveInteger, // Ensures positive integer
      },
      status: {
        label: 'Status',
        required: true,
        expectedType: ParameterType.STRING,
        decoder: createEnum(['active', 'inactive', 'pending']), // Only allows specific values
      },
      receiveNewsletter: {
        label: 'Receive Newsletter',
        expectedType: ParameterType.BOOLEAN,
        default: false,
        decoder: stringToBoolean, // Converts "true"/"false"/"1"/"0"/"yes"/"no" to boolean
      },
      bio: {
        label: 'Bio',
        expectedType: ParameterType.STRING,
        default: '',
        decoder: optionalTrimmedString('No bio provided'), // Returns default for non-string
      },
    },
  }, event);
  
  // params.email is now validated and lowercase
  // params.name is trimmed with no extra spaces
  // params.age is a positive integer
  // params.status is one of: 'active', 'inactive', 'pending'
  // params.receiveNewsletter is true/false boolean
  // params.bio is trimmed string or default value
};
```

**Available Decoders:**

**String Decoders:**
- `trimmedString(value)` - Removes whitespace, validates non-empty
- `trimmedLowerString(value)` - Trims and converts to lowercase
- `alphanumericId(value)` - Validates alphanumeric with hyphens/underscores, converts to lowercase
- `validEmail(value)` - Validates email format, converts to lowercase

**Number Decoders:**
- `positiveInteger(value)` - Converts to integer, validates > 0
- `limitedInteger(min?, max?)(value)` - Validates integer within range (default 1-1000)

**JSON Decoders:**
- `urlEncodedJson(value)` - Decodes URL-encoded JSON string
- `jsonString(value)` - Parses JSON string

**Enum Decoder:**
- `createEnum(validValues)(value)` - Validates value is in allowed list, normalizes to lowercase

**Array Decoder:**
- `stringArray(value)` - Filters array to non-empty strings

**Boolean Decoder:**
- `stringToBoolean(value)` - Converts "true"/"false"/"1"/"0"/"yes"/"no"/"on"/"off" to boolean

**Date Decoder:**
- `isoDateString(value)` - Validates ISO date format, normalizes to ISO string

**Optional Decoders:**
- `optionalTrimmedString(defaultValue?)(value)` - Returns trimmed string or default (default: '')
- `optionalInteger(defaultValue?)(value)` - Returns integer or default (default: 0)

**Examples:**

```typescript
// Email validation and normalization
decoder: validEmail
// Input: "USER@EXAMPLE.COM" → Output: "user@example.com"

// Trim and validate non-empty
decoder: trimmedString
// Input: "  hello  " → Output: "hello"

// Integer range validation
decoder: limitedInteger(1, 100)
// Input: "50" → Output: 50
// Input: "150" → throws "Must be a number between 1 and 100"

// Enum validation
decoder: createEnum(['admin', 'user', 'guest'])
// Input: "ADMIN" → Output: "admin"
// Input: "invalid" → throws "Must be one of: admin, user, guest"

// Boolean conversion
decoder: stringToBoolean
// Input: "yes" → Output: true
// Input: "0" → Output: false
// Input: "maybe" → throws error

// Optional with default
decoder: optionalTrimmedString('N/A')
// Input: null → Output: "N/A"
// Input: "  text  " → Output: "text"
```

## API Reference

### Parsers

#### `parseJsonBody<T>(body: string | null | undefined, options?: ParseJsonBodyOptions<T>): T`

Parses a JSON stringified body with enhanced null handling and validation.

**Type Parameters:**
- `T` - The expected type of the parsed object

**Parameters:**
- `body: string | null | undefined` - The stringified JSON body to parse
- `options?: ParseJsonBodyOptions<T>` - Optional configuration
  - `defaultValue?: T` - Default value when body is empty (makes body optional)

**Returns:**
- `T` - The parsed object of type T

**Throws:**
- `BadRequest` - When body is invalid JSON or empty (unless defaultValue provided)

---

### Errors

#### HTTP Status Enum

Type-safe HTTP status codes for all standard HTTP responses:

```typescript
import { HttpStatus, HttpErrorStatus, isValidHttpStatus, isValidHttpErrorStatus, getHttpStatusName } from 'awpaki';

// HttpStatus - All standard HTTP status codes (1xx, 2xx, 3xx, 4xx, 5xx)
return {
  statusCode: HttpStatus.OK,              // 200
  body: JSON.stringify({ success: true })
};

return {
  statusCode: HttpStatus.CREATED,         // 201
  body: JSON.stringify({ id: newId })
};

return {
  statusCode: HttpStatus.NO_CONTENT,      // 204
};

// HttpErrorStatus - Only error codes with mapped error classes
const schema = {
  pathParameters: {
    id: {
      label: 'User ID',
      required: true,
      statusCodeError: HttpErrorStatus.NOT_FOUND  // 404 - Type-safe!
    }
  },
  headers: {
    authorization: {
      label: 'Authorization',
      required: true,
      statusCodeError: HttpErrorStatus.UNAUTHORIZED  // 401
    }
  }
};

// Validation helpers
isValidHttpStatus(200);           // true - validates all HTTP status codes
isValidHttpStatus(404);           // true
isValidHttpStatus(999);           // false

isValidHttpErrorStatus(404);      // true - validates only error codes with classes
isValidHttpErrorStatus(200);      // false - not an error status
isValidHttpErrorStatus(418);      // false - not mapped in HttpErrorStatus

getHttpStatusName(404);           // "NotFound"
getHttpStatusName(HttpStatus.NOT_FOUND); // "NotFound"
getHttpStatusName(200);           // undefined - no error class for success codes
```

**HttpStatus - All Standard HTTP Status Codes:**
```typescript
enum HttpStatus {
  // 1xx Informational
  CONTINUE = 100,
  SWITCHING_PROTOCOLS = 101,
  PROCESSING = 102,
  
  // 2xx Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  // ... and more
  
  // 3xx Redirection
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  NOT_MODIFIED = 304,
  TEMPORARY_REDIRECT = 307,
  // ... and more
  
  // 4xx Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  // ... and more
  
  // 5xx Server Errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  // ... and more
}
```

**HttpErrorStatus - Error Codes with Mapped Error Classes:**
```typescript
enum HttpErrorStatus {
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  PRECONDITION_FAILED = 412,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}
```

#### HTTP Error Classes

All error classes extend `HttpError` and include:
- `statusCode: number` - HTTP status code
- `data?: Record<string, any>` - Additional error data
- `headers?: Record<string, string | boolean | number>` - Custom headers
- `toLambdaResponse()` - Converts to API Gateway response
- `toString()` - Formatted string for logging

**Available Classes:**
- `BadRequest` (400)
- `Unauthorized` (401)
- `Forbidden` (403)
- `NotFound` (404)
- `Conflict` (409)
- `PreconditionFailed` (412)
- `UnprocessableEntity` (422)
- `TooManyRequests` (429)
- `InternalServerError` (500)
- `NotImplemented` (501)
- `BadGateway` (502)
- `ServiceUnavailable` (503)

#### HTTP Error Mapping

Use `createHttpError()` to dynamically create the appropriate error based on status code:

```typescript
import { createHttpError, HttpStatus } from 'awpaki';

// With enum (recommended)
const error1 = createHttpError(HttpStatus.NOT_FOUND, 'User not found', { userId: 123 });

// With number
const error2 = createHttpError(404, 'User not found', { userId: 123 });

// Creates a BadRequest error
const error3 = createHttpError(HttpStatus.BAD_REQUEST, 'Invalid input');

// Creates an Unauthorized error
const error4 = createHttpError(HttpStatus.UNAUTHORIZED, 'Token expired');

// Creates an Unauthorized error
const error3 = createHttpError(401, 'Token expired');

// Unmapped status codes fallback to NotImplemented (501)
const error4 = createHttpError(999, 'Unknown error'); // Returns NotImplemented (501)
const error5 = createHttpError(418, "I'm a teapot"); // Returns NotImplemented (501)
```

The `HTTP_ERROR_MAP` object maps status codes to error classes:

```typescript
{
  400: BadRequest,
  401: Unauthorized,
  403: Forbidden,
  404: NotFound,
  409: Conflict,
  412: PreconditionFailed,
  422: UnprocessableEntity,
  429: TooManyRequests,
  500: InternalServerError,
  501: NotImplemented,
  502: BadGateway,
  503: ServiceUnavailable,
}
```

**Usage in extractEventParams:**

The `extractEventParams` function uses `createHttpError()` internally, so specifying `statusCodeError` in your schema will automatically throw the correct error type:

```typescript
import { HttpErrorStatus } from 'awpaki';

const schema = {
  pathParameters: {
    id: { 
      label: 'User ID', 
      required: true, 
      statusCodeError: HttpErrorStatus.NOT_FOUND  // Type-safe
    }
  },
  headers: {
    authorization: { 
      label: 'Authorization', 
      required: true, 
      statusCodeError: HttpErrorStatus.UNAUTHORIZED
    }
  },
  body: {
    email: { 
      label: 'Email', 
      required: true, 
      statusCodeError: HttpErrorStatus.BAD_REQUEST
    }
  }
};

try {
  extractEventParams(schema, event);
} catch (error) {
  // error will be NotFound (404), Unauthorized (401), or BadRequest (400)
  // depending on which validation failed
}
```

---

### Extractors

#### Parameter Type Enum

Type-safe parameter types for validation:

```typescript
import { ParameterType } from 'awpaki';

enum ParameterType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
}
```

**Usage in extractEventParams:**

```typescript
import { ParameterType, HttpErrorStatus } from 'awpaki';

const schema = {
  pathParameters: {
    id: {
      label: 'User ID',
      required: true,
      expectedType: ParameterType.STRING,  // Type-safe!
      statusCodeError: HttpErrorStatus.NOT_FOUND
    }
  },
  queryStringParameters: {
    limit: {
      label: 'Result Limit',
      expectedType: ParameterType.NUMBER,
      default: 10
    },
    active: {
      label: 'Active Filter',
      expectedType: ParameterType.BOOLEAN
    }
  },
  body: {
    tags: {
      label: 'Tags',
      expectedType: ParameterType.ARRAY,
      required: true
    }
  }
};
```

---

#### `extractEventParams<T>(schema: EventSchema, event: APIGatewayProxyEvent | Record<string, unknown>): T`

Extracts and validates parameters from AWS Lambda events with comprehensive validation.

**Type Parameters:**
- `T` - The expected return type

**Parameters:**
- `schema: EventSchema` - Schema defining parameters to extract and validation rules
- `event` - AWS Lambda event (APIGatewayProxyEvent or custom object)

**Returns:**
- `T` - Extracted and validated parameters

**Throws:**
- `UnprocessableEntity` - When validation fails (collects multiple errors)
- `Unauthorized` - When a 401 error is configured

**Schema Configuration:**

Each parameter config supports:
- `label: string` - Human-readable name
- `required?: boolean` - Whether required
- `expectedType?: 'string' | 'number' | 'boolean' | 'object' | 'array'` - Type validation
- `default?: unknown` - Default value if missing
- `statusCodeError?: number` - Custom error status code
- `notFoundError?: string` - Custom missing message
- `wrongTypeMessage?: string` - Custom type error message
- `caseInsensitive?: boolean` - Case-insensitive matching
- `decoder?: (value: unknown) => unknown` - Custom transformer

**Supported Event Sources:**
- `pathParameters` - URL path params
- `queryStringParameters` - Query strings
- `headers` - HTTP headers (with case-insensitive support)
- `body` - Request body (auto-parsed JSON)
- Custom nested paths

---

### Loggers

Lambda event logging utilities for tracking and debugging in production environments.

#### `logApiGatewayEvent(event: APIGatewayProxyEvent, context: Context, config?: LogConfig): void`

Logs API Gateway events with HTTP details.

**Logged Information:**
- HTTP method and path
- Query and path parameters
- Source IP and user agent
- Request ID and timestamp
- Stage and API ID

**Example:**
```typescript
import { logApiGatewayEvent } from 'awpaki';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
  logApiGatewayEvent(event, context);
  // Logs: [API Gateway Request] { httpMethod: 'GET', path: '/users/123', ... }
};
```

#### `logSqsEvent(event: SQSEvent, context: Context, config?: LogConfig): void`

Logs SQS events with message details.

**Logged Information:**
- Message ID and count
- Message body (truncated in INFO, full in DEBUG)
- Queue ARN and region
- Message attributes

**Example:**
```typescript
import { logSqsEvent } from 'awpaki';
import { SQSEvent, Context } from 'aws-lambda';

export const handler = async (event: SQSEvent, context: Context) => {
  logSqsEvent(event, context);
  // Logs: [SQS Event] { recordCount: 1, records: [...] }
};
```

#### `logSnsEvent(event: SNSEvent, context: Context, config?: LogConfig): void`

Logs SNS events with message details.

**Logged Information:**
- Message ID and subject
- Message content (truncated in INFO, full in DEBUG)
- Topic ARN
- Timestamp and message attributes

**Example:**
```typescript
import { logSnsEvent } from 'awpaki';
import { SNSEvent, Context } from 'aws-lambda';

export const handler = async (event: SNSEvent, context: Context) => {
  logSnsEvent(event, context);
  // Logs: [SNS Event] { recordCount: 1, records: [...] }
};
```

#### `logEventBridgeEvent(event: EventBridgeEvent, context: Context, config?: LogConfig): void`

Logs EventBridge (CloudWatch Events) including cron/scheduled events.

**Logged Information:**
- Event ID and source
- Detail type and time
- Resources and region
- Event detail (keys in INFO, full object in DEBUG)

**Example:**
```typescript
import { logEventBridgeEvent } from 'awpaki';
import { EventBridgeEvent, Context } from 'aws-lambda';

export const handler = async (event: EventBridgeEvent<string, any>, context: Context) => {
  logEventBridgeEvent(event, context);
  // Logs: [EventBridge Event] { eventSource: 'aws.events', detailType: 'Scheduled Event', ... }
};
```

#### Log Levels

Control logging verbosity via `LOG_LEVEL` environment variable:

```typescript
enum LogLevel {
  NONE = 'none',      // No logging
  ERROR = 'error',    // Only errors
  WARN = 'warn',      // Warnings and errors
  INFO = 'info',      // Standard info (default)
  DEBUG = 'debug',    // Full details (includes headers, full bodies)
}
```

**Environment Variable:**
```bash
# In your Lambda environment
LOG_LEVEL=info      # Default - standard logging
LOG_LEVEL=debug     # Full details (headers, complete messages)
LOG_LEVEL=none      # Disable logging
```

**Custom Configuration:**
```typescript
import { logApiGatewayEvent, LogLevel } from 'awpaki';

logApiGatewayEvent(event, context, {
  envVar: 'CUSTOM_LOG_LEVEL',        // Custom env var name
  defaultLevel: LogLevel.DEBUG,       // Default if env var not set
  additionalData: {                   // Extra data to include
    version: '1.0.0',
    environment: 'production'
  }
});
```

---

### Validators

Coming soon - Input validation functions.

---

### Transformers

Coming soon - Data transformation utilities.

---

## Project Structure

```
src/
├── index.ts              # Main entry point - exports all modules
├── parsers/              # JSON and data parsing utilities
│   ├── index.ts
│   ├── parseJsonBody.ts
│   └── parseJsonBody.test.ts
├── errors/               # Custom error classes (coming soon)
│   └── index.ts
├── extractors/           # Parameter extractors (coming soon)
│   └── index.ts
├── validators/           # Input validators (coming soon)
│   └── index.ts
└── transformers/         # Data transformers (coming soon)
    └── index.ts
```

For detailed guidelines on adding new features, see [.github/copilot-instructions.md](.github/copilot-instructions.md).

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

## Deployment

This package is automatically deployed to npm via GitHub Actions. The deployment workflow is triggered when:

1. **Creating a Release**: Create a new release on GitHub to automatically publish to npm
2. **Manual Trigger**: Use the "Publish to NPM" workflow from the Actions tab

### Prerequisites

Before deploying, ensure you have:
- Set up the `NPM_TOKEN` secret in your GitHub repository settings
- Proper access rights to publish the package on npm

### Creating a Release

1. Go to your repository on GitHub
2. Click on "Releases" → "Create a new release"
3. Create a new tag (e.g., `v1.0.0`)
4. Publish the release
5. The GitHub Action will automatically build, test, and publish to npm

### CI/CD Workflows

- **CI Workflow**: Runs on every push and pull request to validate code quality
- **Publish Workflow**: Deploys to npm on releases and manual triggers

## License

MIT
