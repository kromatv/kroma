import { createReadStream } from 'node:fs';
import type { AdbConnection } from './connection';

const CHUNK_BYTES = 64 * 1024;
const LARGEST_REASON = 4096;
const FILE_MODE = 0o644;

function request(id: string, value: number): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(value >>> 0, 4);
  return header;
}

/**
 * Copies a file onto the TV through adb's sync service, in the 64 KiB chunks
 * it accepts, and answers once the TV says it has the whole file.
 */
export async function pushFile(
  connection: AdbConnection,
  local: string,
  remote: string,
  onChunk: (bytes: number) => void = () => undefined,
): Promise<void> {
  const stream = await connection.open('sync:');
  try {
    const path = Buffer.from(`${remote},${FILE_MODE}`);
    await stream.write(Buffer.concat([request('SEND', path.length), path]));
    for await (const chunk of createReadStream(local, { highWaterMark: CHUNK_BYTES })) {
      const data = chunk as Buffer;
      await stream.write(Buffer.concat([request('DATA', data.length), data]));
      onChunk(data.length);
    }
    await stream.write(request('DONE', Math.floor(Date.now() / 1000)));

    const answer = await stream.readExactly(8);
    const id = answer.toString('ascii', 0, 4);
    if (id === 'FAIL') {
      const reason = await stream.readExactly(Math.min(answer.readUInt32LE(4), LARGEST_REASON));
      throw new Error(`the TV refused ${remote}: ${reason.toString('utf8')}`);
    }
    if (id !== 'OKAY') throw new Error(`the TV answered the copy of ${remote} with ${id}`);
    await stream.write(request('QUIT', 0));
  } finally {
    stream.close();
  }
}
