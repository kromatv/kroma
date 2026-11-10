import { createReadStream, statSync } from 'node:fs';
import type { SdbConnection } from './connection';

export const SYNC_HEADER_BYTES = 8;
export const SYNC_CHUNK_BYTES = 64 * 1024;
export const PUSH_MODE = 0o100755;

const REPLY_TIMEOUT_MS = 120_000;

export interface SyncMessage {
  id: string;
  value: number;
}

export interface PushOptions {
  mode?: number;
  timeoutMs?: number;
  onProgress?: (sent: number, total: number) => void;
}

export function syncRequest(id: string, value: number): Buffer {
  const header = Buffer.alloc(SYNC_HEADER_BYTES);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(value >>> 0, 4);
  return header;
}

export function syncPayload(id: string, payload: Buffer): Buffer {
  return Buffer.concat([syncRequest(id, payload.length), payload]);
}

export function parseSyncMessage(buffer: Buffer): SyncMessage | null {
  if (buffer.length < SYNC_HEADER_BYTES) return null;
  return { id: buffer.subarray(0, 4).toString('ascii'), value: buffer.readUInt32LE(4) };
}

/** `<path>,<mode>` is what the sync service takes; the mode is the decimal `st_mode`. */
export function sendRequest(remotePath: string, mode = PUSH_MODE): Buffer {
  return syncPayload('SEND', Buffer.from(`${remotePath},${mode}`, 'utf8'));
}

/** Copies a local file to `remotePath`, resolving once the device has taken it. */
export async function pushFile(
  connection: SdbConnection,
  localPath: string,
  remotePath: string,
  { mode = PUSH_MODE, timeoutMs = REPLY_TIMEOUT_MS, onProgress }: PushOptions = {},
): Promise<void> {
  const total = statSync(localPath).size;
  const chunkBytes = Math.min(SYNC_CHUNK_BYTES, connection.maxData - SYNC_HEADER_BYTES);
  const stream = await connection.openStream('sync:');

  try {
    await stream.write(sendRequest(remotePath, mode), timeoutMs);
    let sent = 0;
    for await (const chunk of createReadStream(localPath, { highWaterMark: chunkBytes })) {
      const bytes = chunk as Buffer;
      await stream.write(syncPayload('DATA', bytes), timeoutMs);
      sent += bytes.length;
      onProgress?.(sent, total);
    }
    await stream.write(syncRequest('DONE', Math.floor(Date.now() / 1000)), timeoutMs);

    const reply = await readReply(stream, timeoutMs);
    if (reply.id === 'FAIL') throw new Error(`sdb: the device refused the file: ${reply.text}`);
    if (reply.id !== 'OKAY') throw new Error(`sdb: unexpected sync reply "${reply.id}"`);
    await stream.write(syncRequest('QUIT', 0), timeoutMs).catch(() => undefined);
  } finally {
    stream.close();
  }
}

async function readReply(
  stream: { read: (timeoutMs?: number) => Promise<Buffer | null> },
  timeoutMs: number,
): Promise<{ id: string; text: string }> {
  let buffer = Buffer.alloc(0);
  for (;;) {
    const chunk = await stream.read(timeoutMs);
    if (!chunk) throw new Error('sdb: the sync service closed before answering');
    buffer = Buffer.concat([buffer, chunk]);
    const message = parseSyncMessage(buffer);
    if (!message) continue;
    if (message.id !== 'FAIL') return { id: message.id, text: '' };
    if (buffer.length < SYNC_HEADER_BYTES + message.value) continue;
    const text = buffer
      .subarray(SYNC_HEADER_BYTES, SYNC_HEADER_BYTES + message.value)
      .toString('utf8');
    return { id: message.id, text };
  }
}
