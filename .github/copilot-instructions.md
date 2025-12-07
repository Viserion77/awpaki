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
