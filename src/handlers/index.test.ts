import * as handlers from './index';

describe('handlers barrel', () => {
  it('exposes the three factories', () => {
    expect(typeof handlers.createApiGatewayHandlerV2).toBe('function');
    expect(typeof handlers.createInvokeHandler).toBe('function');
    expect(typeof handlers.createSqsHandler).toBe('function');
  });

  it('exposes the payload normalizer and the log collector seam', () => {
    expect(typeof handlers.normalizeInvokePayload).toBe('function');
    expect(typeof handlers.applyLogCollector).toBe('function');
    expect(typeof handlers.setHandlerLogCollector).toBe('function');
    expect(typeof handlers.getHandlerLogCollector).toBe('function');
    expect(typeof handlers.resetHandlerLogCollector).toBe('function');
  });

  it('exports exactly the intended surface', () => {
    // `arrayContaining` on a not.toEqual passes as soon as ONE listed name is absent, so it
    // would miss a single leaked client. Pinning the exact key set is what actually fails
    // when something new appears in the barrel.
    expect(Object.keys(handlers).sort()).toEqual(
      [
        'applyLogCollector',
        'createApiGatewayHandlerV2',
        'createInvokeHandler',
        'createSqsHandler',
        'getHandlerLogCollector',
        'normalizeInvokePayload',
        'resetHandlerLogCollector',
        'setHandlerLogCollector',
      ].sort()
    );
  });

  it('does not leak any optional AWS SDK client through the module', () => {
    expect(Object.keys(handlers).filter((key) => key.endsWith('Client'))).toEqual([]);
  });

  it('reaches no @aws-sdk package at import time', () => {
    // The factories are meant to be usable by an application that installed no AWS SDK.
    const loaded = Object.keys(require.cache).filter((path) => path.includes('@aws-sdk'));

    expect(loaded).toEqual([]);
  });
});
