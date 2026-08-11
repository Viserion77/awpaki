// Export all parsers
export * from './parsers';

// Export all errors
export * from './errors';

// Export all extractors
export * from './extractors';

// Export all validators
export * from './validators';

// Export all transformers
export * from './transformers';

// Export all loggers
export * from './loggers';

// Export all decoders
export * from './decoders';

// Export the handler factories
export * from './handlers';

// Test helpers (builders for API Gateway events and Lambda contexts) are deliberately
// NOT re-exported here. They are scaffolding for a consumer's test suite, and the root
// barrel is what production code imports; they live under the `awpaki/testing` subpath
// only.

// Export all utils
export * from './utils';

// Export all environment resolvers
export * from './environment';

// Constants: only the symbols that are not already re-exported by './errors'.
// `./constants` also re-exports the HttpStatus surface, so a `export *` here
// would make those names ambiguous at the package root.
export { defaultRetryOptions } from './constants';

// AWS clients live under the awpaki/clients subpath so optional peer
// dependencies are loaded only by applications that import those clients.
