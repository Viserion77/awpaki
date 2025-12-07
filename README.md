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

Parses a JSON stringified body and returns the parsed object with full TypeScript support.

```typescript
import { parseJsonBody } from 'awpaki';

// Parse a simple object
interface User {
  name: string;
  age: number;
}

const jsonString = '{"name": "John Doe", "age": 30}';
const user = parseJsonBody<User>(jsonString);
console.log(user.name); // "John Doe"
console.log(user.age);  // 30

// Parse an array
const arrayString = '[1, 2, 3, 4, 5]';
const numbers = parseJsonBody<number[]>(arrayString);
console.log(numbers); // [1, 2, 3, 4, 5]

// Error handling
try {
  const invalid = parseJsonBody<object>('invalid json');
} catch (error) {
  console.error('Failed to parse JSON:', error.message);
}
```

## API Reference

### Parsers

#### `parseJsonBody<T>(body: string): T`

Parses a JSON stringified body and returns the parsed object.

**Type Parameters:**
- `T` - The expected type of the parsed object

**Parameters:**
- `body: string` - The stringified JSON body to parse

**Returns:**
- `T` - The parsed object of type T

**Throws:**
- `Error` - When the body is not a valid JSON string

### Errors

Coming soon - Custom error classes for better error handling.

### Extractors

Coming soon - Parameter extraction utilities for AWS events and requests.

### Validators

Coming soon - Input validation functions.

### Transformers

Coming soon - Data transformation utilities.

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
