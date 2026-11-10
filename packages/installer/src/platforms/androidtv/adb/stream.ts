export interface StreamSender {
  maxPayload: number;
  write(local: number, remote: number, data: Buffer): void;
  close(local: number, remote: number): void;
}

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * One service opened on the TV. A write waits for the TV to take each chunk
 * before the next goes, as adb requires, and reads come back in order.
 */
export class AdbStream {
  remoteId = 0;
  private readonly chunks: Buffer[] = [];
  private ended = false;
  private failure: Error | null = null;
  private opened: Waiter | null = null;
  private acked: Waiter | null = null;
  private readable: (() => void) | null = null;

  constructor(
    private readonly sender: StreamSender,
    readonly localId: number,
  ) {}

  waitOpened(service: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.opened = {
        resolve,
        reject: () => reject(new Error(`the TV refused to open ${service}`)),
      };
    });
  }

  ready(remoteId: number): void {
    if (this.opened) {
      this.remoteId = remoteId;
      const opened = this.opened;
      this.opened = null;
      opened.resolve();
      return;
    }
    const acked = this.acked;
    this.acked = null;
    acked?.resolve();
  }

  deliver(data: Buffer): void {
    this.chunks.push(data);
    this.wake();
  }

  end(): void {
    this.ended = true;
    this.opened?.reject(new Error('refused'));
    this.opened = null;
    this.acked?.reject(new Error('the TV closed the stream before it took everything'));
    this.acked = null;
    this.wake();
  }

  fail(error: Error): void {
    this.failure = error;
    this.opened?.reject(error);
    this.acked?.reject(error);
    this.opened = null;
    this.acked = null;
    this.wake();
  }

  async write(data: Buffer): Promise<void> {
    const size = this.sender.maxPayload;
    for (let at = 0; at < data.length; at += size) {
      await this.writeChunk(data.subarray(at, at + size));
    }
  }

  async read(): Promise<Buffer | null> {
    while (this.chunks.length === 0) {
      if (this.failure) throw this.failure;
      if (this.ended) return null;
      await new Promise<void>((resolve) => {
        this.readable = resolve;
      });
    }
    return this.chunks.shift() ?? null;
  }

  async readExactly(length: number): Promise<Buffer> {
    const parts: Buffer[] = [];
    let have = 0;
    while (have < length) {
      const chunk = await this.read();
      if (!chunk) throw new Error('the TV closed the stream early');
      parts.push(chunk);
      have += chunk.length;
    }
    const all = Buffer.concat(parts);
    if (all.length > length) this.chunks.unshift(all.subarray(length));
    return all.subarray(0, length);
  }

  async readAll(limit: number): Promise<Buffer> {
    const parts: Buffer[] = [];
    let have = 0;
    for (let chunk = await this.read(); chunk; chunk = await this.read()) {
      have += chunk.length;
      if (have > limit) throw new Error('the TV answered far more than expected');
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  }

  close(): void {
    if (this.ended || this.remoteId === 0) return;
    this.ended = true;
    this.sender.close(this.localId, this.remoteId);
  }

  private writeChunk(chunk: Buffer): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.ended) return Promise.reject(new Error('the TV closed the stream'));
    return new Promise((resolve, reject) => {
      this.acked = { resolve, reject };
      this.sender.write(this.localId, this.remoteId, chunk);
    });
  }

  private wake(): void {
    const readable = this.readable;
    this.readable = null;
    readable?.();
  }
}
