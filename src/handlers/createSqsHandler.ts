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
import type { HttpErrorStatusType } from '../errors/index.js';
import { extractEventParams } from '../extractors/index.js';
import type { EventSchema } from '../extractors/index.js';
import { getLogger, logSqsEvent } from '../loggers/index.js';
import type { LogConfig } from '../loggers/index.js';
import { parseJsonBody } from '../parsers/index.js';
import { applyLogCollector } from './logCollector.js';
import type { HandlerWrapper, LambdaHandler } from './logCollector.js';

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

  /**
   * Stops processing a message group once one of its records fails, and reports every
   * unprocessed record of that group as a failure.
   *
   * Defaults to auto-detection: on for a queue whose ARN ends in `.fifo`, off otherwise.
   *
   * Processing records one after another is **not** the FIFO guarantee — order is only
   * preserved if a failure stops the group. Without this, record 3 of 10 failing meant 4-10
   * still ran, succeeded, and were deleted; only 3 came back, so its side effects landed
   * after theirs and the group was permanently reordered, with nothing in the metrics to
   * show for it. AWS's own rule for `ReportBatchItemFailures` on a FIFO queue is to return
   * the failed message *plus every message after it in that group*.
   *
   * The block is per **message group**, not per batch, so one stuck group does not stall the
   * others in a multi-tenant queue. Set it to `false` to keep the previous behaviour for a
   * FIFO queue whose consumers genuinely do not care about order.
   */
  ordered?: boolean;

  /** Status used for a schema failure with no `statusCodeError` of its own. Defaults to 422 */
  validationStatusCode?: HttpErrorStatusType;

  /** `code` carried by a schema failure, for clients that branch on one */
  validationErrorCode?: string;
}

/**
 * Message group a record belongs to, when ordering has to be preserved.
 *
 * Auto-detection reads the queue ARN rather than the presence of `MessageGroupId`: a standard
 * queue never has one, and a FIFO queue always does, so the ARN is the honest signal and it
 * keeps the answer stable for a record whose attributes are incomplete in a hand-written test.
 *
 * @param record - Record being processed
 * @param ordered - Value of the `ordered` option
 * @returns The group to block on failure, or undefined when order is not being preserved
 */
function orderedGroupIdOf(record: SQSRecord, ordered: boolean | undefined): string | undefined {
  const isOrdered = ordered ?? record.eventSourceARN?.endsWith('.fifo') === true;

  if (!isOrdered) return undefined;

  // A FIFO record always carries a group id. When one is missing — `ordered: true` forced on
  // a standard queue, or a hand-written test event — the whole batch is treated as a single
  // group: blocking too much preserves order, while a per-record fallback would quietly
  // disable the block for every record and reintroduce the defect this exists to fix.
  return record.attributes?.MessageGroupId ?? '__batch';
}

/**
 * Builds an SQS Lambda handler that validates and processes records one by one and
 * reports failures as a partial batch response.
 *
 * Records are processed **sequentially**, in the order AWS delivered them. Every failure —
 * invalid JSON, schema violation or an error thrown by `execute` — is caught, logged with its
 * `messageId` and turned into a `batchItemFailures` entry.
 *
 * What happens to the records *after* a failure depends on the queue. On a standard queue they
 * are still processed, which is the point of a partial batch response. On a **FIFO** queue
 * that would break the ordering guarantee — the later records would commit their side effects
 * and be deleted while the failed one waits to be redelivered — so processing of that
 * **message group** stops and every remaining record of the group is reported as failed
 * without running. Detected from the queue ARN, and controllable with `ordered`.
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
 * // one bad record among ten, on a standard queue:
 * // { batchItemFailures: [{ itemIdentifier: 'msg-4' }] }
 * ```
 *
 * @example
 * ```typescript
 * // Same batch on a FIFO queue, all ten in one message group: the failure blocks the group,
 * // so the records after it are returned untouched and redelivered in order.
 * // { batchItemFailures: [{ itemIdentifier: 'msg-4' }, ..., { itemIdentifier: 'msg-10' }] }
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
    // Message groups whose order is already broken: every later record of the group is
    // reported as failed without running, so AWS redelivers the group intact.
    const blockedGroups = new Set<string>();

    for (const record of event.Records) {
      const groupId = orderedGroupIdOf(record, options.ordered);

      if (groupId !== undefined && blockedGroups.has(groupId)) {
        getLogger().warn(
          {
            messageId: record.messageId,
            messageGroupId: groupId,
            eventSourceARN: record.eventSourceARN,
          },
          `SQS Record skipped, its group failed earlier ${context?.functionName}:${record.messageId}`
        );

        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

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
            : { ...record, body }) as unknown as Record<string, unknown>,
          {
            validationStatusCode: options.validationStatusCode,
            validationErrorCode: options.validationErrorCode,
          }
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

        if (groupId !== undefined) {
          blockedGroups.add(groupId);
        }
      }
    }

    return { batchItemFailures };
  };

  return applyLogCollector(handler, options.logCollector);
}
