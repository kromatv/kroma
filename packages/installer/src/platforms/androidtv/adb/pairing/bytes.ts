import type { Duplex } from 'node:stream';

/**
 * Reads exact counts of bytes off a socket, whatever sizes they arrive in. A
 * read fails when the socket closes first, or says nothing for `timeoutMs`.
 */
export class ByteReader {
  private pending = Buffer.alloc(0);
  private failure: Error | null = null;
  private wake: (() => void) | null = null;

  constructor(
    socket: Duplex,
    private readonly timeoutMs: number,
  ) {
    socket.on('data', (chunk: Buffer) => {
      this.pending = Buffer.concat([this.pending, chunk]);
      this.wake?.();
    });
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('close', () => this.fail(new Error('the connection closed')));
  }

  async read(length: number): Promise<Buffer> {
    while (this.pending.length < length) {
      if (this.failure) throw this.failure;
      await this.more();
    }
    const out = this.pending.subarray(0, length);
    this.pending = this.pending.subarray(length);
    return out;
  }

  private more(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => this.fail(new Error('nothing answered in time')),
        this.timeoutMs,
      );
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  private fail(error: Error): void {
    this.failure ??= error;
    this.wake?.();
  }
}
