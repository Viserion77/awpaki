/**
 * Test helpers shipped with the library.
 *
 * Nothing here is meant to run in production: these builders exist so a consumer can exercise
 * a handler — and awpaki's own helpers — against realistic API Gateway payloads without hand
 * writing 60-line fixtures. They pull no dependency beyond the `aws-lambda` types, which are
 * erased at compile time.
 *
 * @module testing
 */

export {
  createMockEventV1,
  createMockEventV2,
  createMockFetch,
  MOCK_ACCOUNT_ID,
  MOCK_API_ID,
  MOCK_EXTENDED_REQUEST_ID,
  MOCK_REGION,
  MOCK_REQUEST_ID,
  MOCK_RESOURCE_ID,
  MOCK_SOURCE_IP,
  MOCK_STAGE,
  MOCK_USER_AGENT,
} from './create-mock-event';

export type {
  MockEventDescription,
  MockFetch,
  MockMultiValue,
  MockValue,
} from './create-mock-event';

export {
  createMockContext,
  MOCK_AWS_REQUEST_ID,
  MOCK_CONTEXT_ACCOUNT_ID,
  MOCK_CONTEXT_REGION,
  MOCK_FUNCTION_NAME,
  MOCK_REMAINING_TIME_IN_MILLIS,
} from './create-mock-context';

export type { MockContextOverrides } from './create-mock-context';
