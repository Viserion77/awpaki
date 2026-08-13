// Export all parsers
export * from './parsers/index.js';

// Export all errors
export * from './errors/index.js';

// Export all extractors
export * from './extractors/index.js';

// Export all validators
export * from './validators/index.js';

// Export all transformers
export * from './transformers/index.js';

// Export all loggers
export * from './loggers/index.js';

// Export all decoders
export * from './decoders/index.js';

// Export the handler factories
export * from './handlers/index.js';

// Test helpers (builders for API Gateway events and Lambda contexts) are deliberately
// NOT re-exported here. They are scaffolding for a consumer's test suite, and the root
// barrel is what production code imports; they live under the `awpaki/testing` subpath
// only.

// Export all utils
export * from './utils/index.js';

// Export all environment resolvers
export * from './environment/index.js';

// Constants: only the symbols that are not already re-exported by './errors'.
// `./constants` also re-exports the HttpStatus surface, so a `export *` here
// would make those names ambiguous at the package root.
export { defaultRetryOptions } from './constants/index.js';

// AWS clients live under the awpaki/clients subpath so optional peer
// dependencies are loaded only by applications that import those clients.
