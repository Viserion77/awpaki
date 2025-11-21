# awpaki

AWS Patterns Kit - A utility library for AWS patterns

## Description

A TypeScript utility library that provides helper functions for common AWS patterns and operations.

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

## Usage

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

### `parseJsonBody<T>(body: string): T`

Parses a JSON stringified body and returns the parsed object.

**Type Parameters:**
- `T` - The expected type of the parsed object

**Parameters:**
- `body: string` - The stringified JSON body to parse

**Returns:**
- `T` - The parsed object of type T

**Throws:**
- `Error` - When the body is not a valid JSON string

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
