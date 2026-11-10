import { randomBytes, randomInt } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SdbConnection } from './connection';
import { type FakeDevice, fakeDevice, type ServiceSession, toolPath } from './fake-device.fixture';
import {
  PUSH_MODE,
  parseSyncMessage,
  pushFile,
  SYNC_HEADER_BYTES,
  sendRequest,
  syncPayload,
  syncRequest,
} from './sync';

const PATIENT_MS = 200;

const televisions: FakeDevice[] = [];
const connections: SdbConnection[] = [];
const directories: string[] = [];

const idOf = (message: Buffer): string => message.subarray(0, 4).toString('ascii');
const messageOf = (heard: readonly Buffer[], id: string): Buffer =>
  heard.find((message) => idOf(message) === id) ?? Buffer.alloc(SYNC_HEADER_BYTES);
const dataOf = (heard: readonly Buffer[]): Buffer =>
  Buffer.concat(
    heard.filter((message) => idOf(message) === 'DATA').map((m) => m.subarray(SYNC_HEADER_BYTES)),
  );

const localFile = (bytes: number) => {
  const directory = mkdtempSync(join(tmpdir(), 'kroma-sdb-'));
  directories.push(directory);
  const path = join(directory, `KROMA-${randomInt(1000)}.wgt`);
  const content = randomBytes(bytes);
  writeFileSync(path, content);
  return { path, content, remote: `${toolPath()}/${basename(path)}` };
};

const receiving = async (answer: (session: ServiceSession) => void, maxData = 65536) => {
  const set = await fakeDevice({ maxData });
  televisions.push(set);
  const heard: Buffer[] = [];
  set.serve('sync:', async (session) => {
    for (;;) {
      const message = await session.read();
      heard.push(message);
      if (idOf(message) === 'DONE') answer(session);
    }
  });
  const connection = await SdbConnection.open(set.host, set.port, { timeoutMs: PATIENT_MS });
  connections.push(connection);
  return { connection, heard };
};

const accepts = (session: ServiceSession) => session.write(syncRequest('OKAY', 0));

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  await Promise.all(televisions.splice(0).map((set) => set.close()));
});

describe('a sync request', () => {
  it('is four ascii letters and a little-endian length', () => {
    const request = syncRequest('DONE', 1_700_000_000);

    expect(request).toHaveLength(SYNC_HEADER_BYTES);
    expect(request.subarray(0, 4).toString('ascii')).toBe('DONE');
    expect(request.readUInt32LE(4)).toBe(1_700_000_000);
  });

  it('puts the payload length in the header when it carries one', () => {
    const payload = syncPayload('DATA', Buffer.alloc(4096));

    expect(payload.readUInt32LE(4)).toBe(4096);
    expect(payload).toHaveLength(SYNC_HEADER_BYTES + 4096);
  });

  it('names the file and its mode in one comma-joined field', () => {
    const request = sendRequest('/home/owner/share/tmp/sdk_tools/KROMA.wgt');

    expect(request.subarray(SYNC_HEADER_BYTES).toString('utf8')).toBe(
      `/home/owner/share/tmp/sdk_tools/KROMA.wgt,${PUSH_MODE}`,
    );
  });

  it('sends the mode as the decimal st_mode sdb uses', () => {
    expect(PUSH_MODE).toBe(33261);
  });
});

describe('a sync reply', () => {
  it('reads an acceptance', () => {
    expect(parseSyncMessage(syncRequest('OKAY', 0))).toEqual({ id: 'OKAY', value: 0 });
  });

  it('reads a refusal and the length of its message', () => {
    const reply = syncPayload('FAIL', Buffer.from('no such directory', 'utf8'));

    expect(parseSyncMessage(reply)).toEqual({ id: 'FAIL', value: 17 });
  });

  it('waits for the whole header before deciding anything', () => {
    expect(parseSyncMessage(Buffer.from('OKA', 'ascii'))).toBeNull();
  });
});

describe('pushing a file', () => {
  it('names the destination and the mode sdb forces on it', async () => {
    const { connection, heard } = await receiving(accepts);
    const file = localFile(64);

    await pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    expect(messageOf(heard, 'SEND').subarray(SYNC_HEADER_BYTES).toString('utf8')).toBe(
      `${file.remote},${PUSH_MODE}`,
    );
  });

  it('sends a file bigger than one write in several DATA messages', async () => {
    const { connection, heard } = await receiving(accepts, 1024);
    const file = localFile(2500);

    await pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    expect(heard.filter((message) => idOf(message) === 'DATA')).toHaveLength(3);
    expect(dataOf(heard)).toEqual(file.content);
  });

  it('reports the bytes as they leave', async () => {
    const { connection } = await receiving(accepts, 1024);
    const file = localFile(2500);
    const progress: number[][] = [];

    await pushFile(connection, file.path, file.remote, {
      timeoutMs: PATIENT_MS,
      onProgress: (sent, total) => void progress.push([sent, total]),
    });

    expect(progress).toEqual([
      [1016, 2500],
      [2032, 2500],
      [2500, 2500],
    ]);
  });

  it('ends with the mtime the device stamps the file with', async () => {
    const { connection, heard } = await receiving(accepts);
    const file = localFile(64);

    await pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    const stamped = messageOf(heard, 'DONE').readUInt32LE(4);
    expect(Math.abs(stamped - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(5);
  });

  it('leaves the sync service once the device has taken the file', async () => {
    const { connection, heard } = await receiving(accepts);
    const file = localFile(64);

    await pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    expect(heard.map(idOf)).toEqual(['SEND', 'DATA', 'DONE', 'QUIT']);
  });

  it('shrugs when the set hangs up before it can say goodbye', async () => {
    const { connection } = await receiving((session) => session.end(syncRequest('OKAY', 0)));
    const file = localFile(64);

    const push = pushFile(connection, file.path, file.remote, { timeoutMs: 50 });

    await expect(push).resolves.toBeUndefined();
  });

  it('reports the message the device refused the file with', async () => {
    const { connection } = await receiving((session) =>
      session.write(syncPayload('FAIL', Buffer.from('No such file or directory', 'utf8'))),
    );
    const file = localFile(64);

    const push = pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    await expect(push).rejects.toThrow(
      'sdb: the device refused the file: No such file or directory',
    );
  });

  it('waits for a refusal that arrives in pieces', async () => {
    const message = Buffer.from('the package is not signed', 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32LE(message.length, 0);
    const { connection } = await receiving((session) => {
      session.write(Buffer.from('FAIL', 'ascii'));
      session.write(length);
      session.write(message);
    });
    const file = localFile(64);

    const push = pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    await expect(push).rejects.toThrow('the package is not signed');
  });

  it('fails on a reply it does not recognise', async () => {
    const { connection } = await receiving((session) => session.write(syncRequest('HUH!', 0)));
    const file = localFile(64);

    const push = pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    await expect(push).rejects.toThrow('sdb: unexpected sync reply "HUH!"');
  });

  it('fails when the sync service closes before answering', async () => {
    const { connection } = await receiving((session) => session.close());
    const file = localFile(64);

    const push = pushFile(connection, file.path, file.remote, { timeoutMs: PATIENT_MS });

    await expect(push).rejects.toThrow(/closed before answering/);
  });
});
