/**
 * Lazy singletons for the AWS SDK clients of the package.
 *
 * Every client module used to build its SDK client at **import** time, which had three costs:
 * the region and endpoint were frozen at whatever the environment held when the module was
 * first required (so a test setting `AWS_ENDPOINT_URL` after the import had no effect, while
 * one that set it before did — the same code with two different behaviours), there was no seam
 * to swap or clear a client between tests, and a subpath import paid for a client the caller
 * might never use.
 *
 * Construction is deferred to the first call instead, and the instance is cached for the life
 * of the container — which is where the real saving always was. The cost of a warm call is one
 * property read.
 *
 * This module must not import any `@aws-sdk/*` package: it is reachable from the aggregate
 * barrel, whose whole point is to load nothing. The structural `Disposable` type below is
 * enough to destroy a client without knowing what it is.
 *
 * @module clients/lazyClient
 */

/** What this module needs to know about an SDK client: that it may be destroyable. */
interface Disposable {
  destroy?: () => void;
}

/**
 * A lazily constructed, cached client.
 *
 * @template T - Client type
 */
export interface LazyClient<T> {
  /** Returns the client, building it on first use. */
  get: () => T;
  /** Drops the cached instance, destroying it first. */
  reset: () => void;
}

const registry = new Set<{ reset: () => void }>();

/**
 * Creates a lazily constructed client, registered for {@link resetAwsClients}.
 *
 * @template T - Client type
 * @param factory - Builds the client on first use
 * @returns The accessor and its reset function
 *
 * @example
 * ```typescript
 * const lazy = createLazyClient(() => new S3Client({ region: resolveRegion() }));
 * lazy.get().send(command);
 * ```
 */
export function createLazyClient<T extends Disposable>(factory: () => T): LazyClient<T> {
  let instance: T | undefined;

  const reset = (): void => {
    // Destroying releases the keep-alive sockets and the credential provider's timers, which
    // is what otherwise keeps a jest run open after the last test. A client mid-request would
    // have to have been abandoned by its caller for this to be observable.
    try {
      instance?.destroy?.();
    } catch {
      // A client that fails to shut down must not fail the test or the reconfiguration that
      // asked for the reset.
    }
    instance = undefined;
  };

  const lazy: LazyClient<T> = {
    get: (): T => {
      instance ??= factory();
      return instance;
    },
    reset,
  };

  registry.add({ reset });

  return lazy;
}

/**
 * Drops every cached AWS client, so the next call rebuilds it from the current environment.
 *
 * Only clients whose module was actually loaded are affected — the registry is populated as
 * each module is imported, so this never forces a client into existence.
 *
 * @returns Nothing
 *
 * @example
 * ```typescript
 * import { resetAwsClients } from 'awpaki/clients';
 *
 * afterEach(() => {
 *   process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
 *   resetAwsClients();
 * });
 * ```
 */
export function resetAwsClients(): void {
  for (const entry of registry) {
    entry.reset();
  }
}
