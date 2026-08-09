/**
 * Handler factory for SQS queues, with partial batch responses.
 *
 * A throwing SQS handler makes the **whole batch** visible again: records that were
 * already processed are delivered a second time, and a single poison message can keep
 * the batch cycling until the redrive policy gives up. This factory processes each
 * record in isolation and returns `batchItemFailures`, so only the records that
 * actually failed come back.
 *
 * Requires `functionResponseTypes: [ReportBatchItemFailures]` on the event source
 * mapping — without it, AWS ignores the response and retries the whole batch.
 *
 * @module handlers/createSqsHandler
 */

import type {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
  Context,
} from 'aws-lambda';
import { extractEventParams } from '../extractors';
import type { EventSchema } from '../extractors';
import { getLogger, logSqsEvent } from '../loggers';
import type { LogConfig } from '../loggers';
import { parseJsonBody } from '../parsers';
import { applyLogCollector } from './logCollector';
import type { HandlerWrapper, LambdaHandler } from './logCollector';

/**
 * Everything `execute` receives, once per record.
 *
 * @template TParams - Shape produced by the schema
 */
export interface SqsHandlerInput<TParams> {
  /** Parameters extracted and validated from this record */
  params: TParams;
  /** Record being processed */
  record: SQSRecord;
  /** Record body, parsed from JSON unless `parseBody` is false */
  body: unknown;
  /** Full SQS event, for cross-record decisions */
  event: SQSEvent;
  /** Lambda context */
  context: Context;
}

/**
 * Configuration of {@link createSqsHandler}.
 *
 * @template TParams - Shape produced by the schema
 */
export interface CreateSqsHandlerOptions<TParams> {
  /**
   * Schema handed to {@link extractEventParams} for every record. The record is the
   * event, so message fields live under `body`:
   * `{ body: { orderId: { label: 'Order', required: true } } }`.
   */
  schema?: EventSchema;
  /** Business function, called once per record */
  execute: (input: SqsHandlerInput<TParams>) => unknown | Promise<unknown>;
  /**
   * Parse each body as JSON. Defaults to true; set to false for plain text queues.
   *
   * With parsing off the text reaches `execute` under `body` as usual, but the schema
   * addresses it as `rawBody` — {@link extractEventParams} JSON-parses any string it
   * finds under `body`, which is precisely what this option opted out of.
   */
  parseBody?: boolean;
  /** Extra data merged into the entry log record */
  logConfig?: LogConfig;
  /** Per-handler log collector, taking precedence over the globally registered one */
  logCollector?: HandlerWrapper<SQSEvent, SQSBatchResponse>;
}

/**
 * Builds an SQS Lambda handler that validates and processes records one by one and
 * reports failures as a partial batch response.
 *
 * Records are processed **sequentially**, in the order AWS delivered them, so FIFO
 * queues keep their guarantees. Every failure — invalid JSON, schema violation or an
 * error thrown by `execute` — is caught, logged with its `messageId` and turned into a
 * `batchItemFailures` entry; the remaining records are still processed.
 *
 * @template TParams - Shape produced by the schema
 * @param options - Schema, business function and parsing behaviour
 * @returns An async Lambda handler resolving with `{ batchItemFailures }`
 * @throws TypeError if `execute` is not a function
 *
 * @example
 * ```typescript
 * export const handler = createSqsHandler({
 *   schema: {
 *     body: {
 *       orderId: { label: 'Order ID', required: true, expectedType: ParameterType.STRING },
 *     },
 *   },
 *   execute: async ({ params, record }) => {
 *     await processOrder(params.orderId, record.messageId);
 *   },
 * });
 *
 * // one bad record among ten:
 * // { batchItemFailures: [{ itemIdentifier: 'msg-4' }] }
 * ```
 */
export function createSqsHandler<TParams = Record<string, unknown>>(
  options: CreateSqsHandlerOptions<TParams>
): LambdaHandler<SQSEvent, SQSBatchResponse> {
  if (typeof options?.execute !== 'function') {
    throw new TypeError('createSqsHandler expects an `execute` function');
  }

  const handler: LambdaHandler<SQSEvent, SQSBatchResponse> = async (
    event: SQSEvent,
    context: Context
  ): Promise<SQSBatchResponse> => {
    logSqsEvent(event, context, options.logConfig);

    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      try {
        const rawBodyOnly = options.parseBody === false;
        const body = rawBodyOnly ? record.body : parseJsonBody<unknown>(record.body);

        // The record itself is the event handed to the extractor, with `body` already
        // parsed, so schemas address message fields under `body` and still reach
        // `messageAttributes`, `attributes` and the rest of the record. When parsing is
        // off, the text moves to `rawBody`: the extractor JSON-parses a string `body`
        // on its own, which would defeat the option.
        const params = extractEventParams<TParams>(
          options.schema ?? {},
          (rawBodyOnly
            ? { ...record, body: undefined, rawBody: record.body }
            : { ...record, body }) as unknown as Record<string, unknown>
        );

        await options.execute({ params, record, body, event, context });
      } catch (error) {
        getLogger().error(
          {
            messageId: record.messageId,
            eventSourceARN: record.eventSourceARN,
            err: error,
          },
          `SQS Record failed ${context?.functionName}:${record.messageId}`
        );

        // A record without a messageId cannot be reported individually. Pushing the
        // missing identifier makes AWS retry the whole batch, which loses nothing;
        // re-throwing here would abort the records that come next, which does.
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };

  return applyLogCollector(handler, options.logCollector);
}
