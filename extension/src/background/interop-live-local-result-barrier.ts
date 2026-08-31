import { InteropTransportError } from '../core/interop/transport.js';

type LiveLocalOperationResult = 'completed' | 'reviewing';

interface PendingResult {
  readonly promise: Promise<LiveLocalOperationResult>;
  resolve(result: LiveLocalOperationResult): void;
  reject(error: Error): void;
}

function pendingResult(): PendingResult {
  let resolve!: (result: LiveLocalOperationResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<LiveLocalOperationResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** Orders commit results so journal scanners never run ahead of remote staging. */
export class LiveLocalResultBarrier {
  readonly #pending: PendingResult[] = [];

  constructor(private readonly timeoutMs = 15_000) {}

  async wait(send: () => void): Promise<void> {
    const pending = pendingResult();
    this.#pending.push(pending);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      send();
      await Promise.race([
        pending.promise,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new InteropTransportError('Overlook did not finish staging the reviewed live local result.', 'offline', true)),
            this.timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      const index = this.#pending.indexOf(pending);
      if (index >= 0) this.#pending.splice(index, 1);
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  resolve(result: LiveLocalOperationResult): void {
    this.#pending.shift()?.resolve(result);
  }

  close(error: Error): void {
    for (const pending of this.#pending.splice(0)) pending.reject(error);
  }
}
