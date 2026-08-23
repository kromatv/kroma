import { SDB_COMMAND } from './packet';

const EMPTY = Buffer.alloc(0);

export interface StreamTransport {
  readonly maxData: number;
  send(command: number, arg0: number, arg1: number, data: Buffer): void;
  release(localId: number): void;
}

export interface DrainOptions {
  limit?: number;
  timeoutMs?: number;
}

interface Waiter<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

const DEFAULT_LIMIT = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

/** One multiplexed service on an open connection: `shell:…`, `sync:`, `capability:`. */
export class SdbStream {
  remoteId = 0;
  private readonly pending: Buffer[] = [];
  private readonly readers: Waiter<Buffer | null>[] = [];
  private readonly acks: Waiter<void>[] = [];
  private opened: Waiter<void> | null = null;
  private ended = false;
  private failure: Error | null = null;

  constructor(
    readonly service: string,
    readonly localId: number,
    private readonly transport: StreamTransport,
  ) {}

  ready(timeoutMs: number): Promise<void> {
    return this.deadline(
      new Promise<void>((resolve, reject) => {
        this.opened = { resolve, reject };
      }),
      timeoutMs,
      `sdb: the device never accepted ${this.service}`,
    );
  }

  onOkay(remoteId: number): void {
    if (this.remoteId === 0) {
      this.remoteId = remoteId;
      this.opened?.resolve();
      this.opened = null;
      return;
    }
    this.acks.shift()?.resolve();
  }

  onData(data: Buffer): void {
    this.transport.send(SDB_COMMAND.OKAY, this.localId, this.remoteId, EMPTY);
    const reader = this.readers.shift();
    if (reader) reader.resolve(data);
    else this.pending.push(data);
  }

  onClose(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.remoteId !== 0) {
      this.transport.send(SDB_COMMAND.CLSE, this.localId, this.remoteId, EMPTY);
    }
    this.transport.release(this.localId);
    this.opened?.reject(new Error(`sdb: the device refused ${this.service}`));
    this.opened = null;
    for (const reader of this.readers.splice(0)) reader.resolve(null);
    for (const ack of this.acks.splice(0)) ack.reject(new Error('sdb: stream closed mid-write'));
  }

  onFail(error: Error): void {
    this.failure = error;
    this.ended = true;
    this.opened?.reject(error);
    this.opened = null;
    for (const reader of this.readers.splice(0)) reader.reject(error);
    for (const ack of this.acks.splice(0)) ack.reject(error);
  }

  async write(data: Buffer, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    for (let at = 0; at < data.length; at += this.transport.maxData) {
      const chunk = data.subarray(at, at + this.transport.maxData);
      const acked = new Promise<void>((resolve, reject) => {
        this.acks.push({ resolve, reject });
      });
      this.transport.send(SDB_COMMAND.WRTE, this.localId, this.remoteId, chunk);
      await this.deadline(acked, timeoutMs, `sdb: ${this.service} never acknowledged a write`);
    }
  }

  read(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Buffer | null> {
    if (this.failure) return Promise.reject(this.failure);
    const buffered = this.pending.shift();
    if (buffered) return Promise.resolve(buffered);
    if (this.ended) return Promise.resolve(null);
    return this.deadline(
      new Promise<Buffer | null>((resolve, reject) => {
        this.readers.push({ resolve, reject });
      }),
      timeoutMs,
      `sdb: ${this.service} went quiet`,
    );
  }

  /** Everything the service says until it closes, capped at `limit` bytes. */
  async drain({ limit = DEFAULT_LIMIT, timeoutMs }: DrainOptions = {}): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      const chunk = await this.read(timeoutMs);
      if (!chunk) break;
      chunks.push(chunk);
      size += chunk.length;
      if (size >= limit) break;
    }
    return Buffer.concat(chunks).subarray(0, limit);
  }

  close(): void {
    this.onClose();
  }

  private deadline<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, expiry]).finally(() => clearTimeout(timer)) as Promise<T>;
  }
}
