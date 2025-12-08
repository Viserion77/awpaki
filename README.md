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
- 🧪 **Well Tested**: Comprehensive test coverage with Jest
- 📝 **JSDoc Documentation**: Complete JSDoc documentation for all functions
- 🚀 **Easy to Use**: Simple and intuitive API
- 🗂️ **Modular Architecture**: Organized by feature categories (parsers, errors, extractors, validators, transformers)
- 📚 **Flexible Imports**: Import from root or specific categories

## Usage

The library is organized into categories for better organization:

- **parsers/**: Data parsing utilities (JSON, etc.)
- **errors/**: Custom error classes and error handling
- **extractors/**: Parameter and data extraction utilities
- **validators/**: Input validation functions
- **transformers/**: Data transformation utilities

### Import Options

```typescript
// Option 1: Import from root (recommended)
import { parseJsonBody } from 'awpaki';

// Option 2: Import from specific category
import { parseJsonBody } from 'awpaki/parsers';

// Option 3: Import entire category as namespace
import * as parsers from 'awpaki/parsers';
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

Type-safe HTTP status codes with validation helpers:

```typescript
import { HttpStatus, isValidHttpStatus, getHttpStatusName } from 'awpaki';

// Use enum instead of magic numbers
const schema = {
  pathParameters: {
    id: {
      label: 'User ID',
      required: true,
      statusCodeError: HttpStatus.NOT_FOUND  // 404 - Type-safe!
    }
  },
  headers: {
    authorization: {
      label: 'Authorization',
      required: true,
      statusCodeError: HttpStatus.UNAUTHORIZED  // 401
    }
  }
};

// Validation helpers
isValidHttpStatus(404);           // true
isValidHttpStatus(999);           // false
getHttpStatusName(404);           // "NotFound"
getHttpStatusName(HttpStatus.NOT_FOUND); // "NotFound"
```

**Available Status Codes:**
```typescript
enum HttpStatus {
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
import { HttpStatus } from 'awpaki';

const schema = {
  pathParameters: {
    id: { 
      label: 'User ID', 
      required: true, 
      statusCodeError: HttpStatus.NOT_FOUND  // Type-safe
    }
  },
  headers: {
    authorization: { 
      label: 'Authorization', 
      required: true, 
      statusCodeError: HttpStatus.UNAUTHORIZED
    }
  },
  body: {
    email: { 
      label: 'Email', 
      required: true, 
      statusCodeError: HttpStatus.BAD_REQUEST
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
import { ParameterType, HttpStatus } from 'awpaki';

const schema = {
  pathParameters: {
    id: {
      label: 'User ID',
      required: true,
      expectedType: ParameterType.STRING,  // Type-safe!
      statusCodeError: HttpStatus.NOT_FOUND
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
