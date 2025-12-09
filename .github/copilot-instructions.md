# Project Structure Guidelines

This project follows a modular architecture organized by feature categories.

## Project Features & Requirements

This library maintains the following standards:

- 📦 **TypeScript Support**: All code must be written in TypeScript with full type definitions
- 🧪 **Well Tested**: Every function must have comprehensive test coverage with Jest
- 📝 **JSDoc Documentation**: All public functions must include complete JSDoc comments
- 🚀 **Easy to Use**: APIs should be simple, intuitive, and follow consistent patterns
- 🗂️ **Modular Architecture**: Code organized by feature categories for discoverability
- 📚 **Flexible Imports**: Support multiple import patterns (root, category, namespace)

## Directory Structure

```
src/
├── index.ts              # Main entry point - exports all modules
├── parsers/              # JSON and data parsing utilities
│   ├── index.ts
│   ├── parseJsonBody.ts
│   └── parseJsonBody.test.ts
├── errors/               # Custom error classes and error handling
│   └── index.ts
├── extractors/           # Parameter and data extraction utilities
│   └── index.ts
├── validators/           # Input validation functions
│   └── index.ts
└── transformers/         # Data transformation utilities
    └── index.ts
```

## Adding New Features

### 1. Choose the Right Category

- **parsers/**: Functions that parse data (JSON, XML, CSV, etc.)
- **errors/**: Custom error classes and error handling utilities
- **extractors/**: Functions that extract data from requests, events, etc.
- **validators/**: Functions that validate inputs and data structures
- **transformers/**: Functions that transform data between formats
- **loggers/**: Lambda event logging utilities for tracking and debugging

### 2. Create Your Module

Example: Adding a new parser

```typescript
// src/parsers/parseXml.ts
/**
 * Parses an XML string and returns a parsed object
 * @param xml - The XML string to parse
 * @returns The parsed object
 */
export function parseXml<T>(xml: string): T {
  // Implementation
}
```

### 3. Create Tests

```typescript
// src/parsers/parseXml.test.ts
import { parseXml } from './parseXml';

describe('parseXml', () => {
  it('should parse valid XML', () => {
    // Test implementation
  });
});
```

### 4. Export from Category Index

```typescript
// src/parsers/index.ts
export { parseJsonBody } from './parseJsonBody';
export { parseXml } from './parseXml'; // Add new export
```

### 5. Main Index Auto-Exports

The main `src/index.ts` automatically exports all categories via barrel exports:

```typescript
export * from './parsers';
export * from './errors';
export * from './extractors';
export * from './validators';
export * from './transformers';
```

## Import Patterns

Users can import in multiple ways:

```typescript
// Root import (recommended)
import { parseJsonBody, parseXml } from 'awpaki';

// Category import
import { parseJsonBody } from 'awpaki/parsers';

// Namespace import
import * as parsers from 'awpaki/parsers';
```

## Code Style

- Use TypeScript with strict mode
- Include JSDoc comments for all public functions
- Write comprehensive tests for all features
- Follow existing naming conventions
- Keep functions pure and focused on single responsibilities
- **Avoid `forEach`**: Use `for...of` or `map/filter/reduce` instead. The `forEach` method increases cognitive load and makes code harder to reason about
- **Prefer function declarations over arrow functions**: Use `function functionName() {}` instead of `const functionName = () => {}`. Regular function declarations appear in stack traces with their names, making debugging easier. Arrow functions show as anonymous in stack traces, making production errors harder to diagnose.

**Function Declaration Examples:**

```typescript
// ✅ Good: Named function (appears in stack trace)
export function parseJsonBody<T>(body: string): T {
  // Implementation
}

// ✅ Good: Named function with type parameters
export function extractEventParams<T>(schema: EventSchema, event: APIGatewayProxyEvent): T {
  // Implementation
}

// ❌ Avoid: Arrow function (anonymous in stack trace)
export const parseJsonBody = <T>(body: string): T => {
  // Shows as "anonymous" or "<anonymous>" in stack traces
};
```

**Exception**: Arrow functions are acceptable for:
- Inline callbacks: `.map(x => x * 2)`
- React components (convention)
- Single-line utilities where stack trace is not critical

## Type Safety Rules

**CRITICAL**: This project enforces strict type safety. Follow these rules:

### 1. Always Use Enums Instead of Magic Numbers/Strings

❌ **NEVER do this:**
```typescript
statusCodeError: 401
expectedType: 'string'
throw new HttpError('Error', 404)
```

✅ **ALWAYS do this:**
```typescript
statusCodeError: HttpStatus.UNAUTHORIZED
expectedType: ParameterType.STRING
throw new NotFound('Error')
```

### 2. Available Enums

- **HttpStatus**: For HTTP status codes (400, 401, 403, 404, 409, 412, 422, 429, 500, 501, 502, 503)
  - Use: `HttpStatus.BAD_REQUEST`, `HttpStatus.NOT_FOUND`, etc.
  - Import from: `'awpaki/errors'` or `'awpaki'`

- **ParameterType**: For parameter type validation
  - Use: `ParameterType.STRING`, `ParameterType.NUMBER`, `ParameterType.BOOLEAN`, `ParameterType.OBJECT`, `ParameterType.ARRAY`
  - Import from: `'awpaki/extractors'` or `'awpaki'`

### 3. Type Annotations Required

- All function parameters must have explicit types
- All return types must be explicitly declared
- No `any` type unless absolutely necessary (document why)
- Use generics for reusable type-safe functions

### 4. Interface vs Type

- Use `interface` for object shapes that may be extended
- Use `type` for unions, intersections, and complex types
- Use `enum` for fixed sets of values

### 5. Examples

```typescript
// ✅ Good: Type-safe parameter configuration
const schema: EventSchema = {
  headers: {
    authorization: {
      label: 'Authorization',
      required: true,
      statusCodeError: HttpStatus.UNAUTHORIZED,
      expectedType: ParameterType.STRING,
    },
  },
};

// ✅ Good: Type-safe error throwing
if (!user) {
  throw new NotFound('User not found');
}

// ✅ Good: Using enum in switch
switch (paramType) {
  case ParameterType.STRING:
    return validateString(value);
  case ParameterType.NUMBER:
    return validateNumber(value);
}
```

## Testing

- All test files should be co-located with source files (`.test.ts`)
- Run tests with `npm test`
- Aim for high test coverage
- Test both success and error cases

## Building

- TypeScript compiles to `dist/` directory
- Source maps are generated for debugging
- Type definitions are automatically generated

## Commit Guidelines

When adding new features:
1. Create feature in appropriate category
2. Add comprehensive tests
3. Update category index.ts
4. Run `npm test` and `npm run build`
5. Commit with descriptive message

## Documentation Guidelines

**DO NOT create separate documentation files** like:
- ❌ `ANALYSIS.md`
- ❌ `NAMING_ANALYSIS.md`
- ❌ `IMPROVEMENTS.md`
- ❌ `FEATURES_V2.md`
- ❌ `RESUMO.md`
- ❌ `DETALHES.md`
- ❌ Any other summary/analysis markdown files

**Instead:**
- ✅ Update the main `README.md` if documentation is needed
- ✅ Add JSDoc comments directly in the code
- ✅ Respond directly to user questions in chat
- ✅ Keep documentation inline with code
