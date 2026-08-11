/**
 * Handler factories — the thin framework layer of awpaki.
 *
 * Each factory owns the skeleton every Lambda repeats (entry log, parameter
 * extraction and validation, gates, a single error `catch`, response shaping) and
 * leaves the consumer with a schema and a business function.
 *
 * @module handlers
 */

export { createApiGatewayHandlerV2 } from './createApiGatewayHandlerV2';
export type {
  ApiGatewayHandlerV2Input,
  ApiGatewayHandlerV2Response,
  ApiGatewayHeaderValue,
  CreateApiGatewayHandlerV2Options,
} from './createApiGatewayHandlerV2';

export { createInvokeHandler, normalizeInvokePayload } from './createInvokeHandler';
export type { CreateInvokeHandlerOptions, InvokeHandlerInput } from './createInvokeHandler';

export { createSqsHandler } from './createSqsHandler';
export type { CreateSqsHandlerOptions, SqsHandlerInput } from './createSqsHandler';

// Seam for the per-invocation log buffer. Handlers run unwrapped until a
// wrapper is registered, so the factories never depend on the collector module.
export {
  applyLogCollector,
  getHandlerLogCollector,
  resetHandlerLogCollector,
  setHandlerLogCollector,
} from './logCollector';
export type { HandlerWrapper, LambdaHandler } from './logCollector';
