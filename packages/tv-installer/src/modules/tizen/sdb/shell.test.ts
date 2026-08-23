import { afterEach, describe, expect, it, vi } from 'vitest';
import { SdbConnection } from './connection';
import { type FakeDevice, fakeDevice, shellCommand } from './fake-device.fixture';
import { SDB_COMMAND } from './packet';
import { shell } from './shell';

const PATIENT_MS = 200;
const IMPATIENT_MS = 20;

const televisions: FakeDevice[] = [];
const connections: SdbConnection[] = [];

const answering = async (prints: string | null): Promise<[FakeDevice, SdbConnection]> => {
  const set = await fakeDevice();
  televisions.push(set);
  set.serve('shell:', (session) => (prints === null ? undefined : session.end(prints)));
  const connection = await SdbConnection.open(set.host, set.port, { timeoutMs: PATIENT_MS });
  connections.push(connection);
  return [set, connection];
};

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  await Promise.all(televisions.splice(0).map((set) => set.close()));
});

describe('a shell command', () => {
  it('runs on the device as one service of its own', async () => {
    const [set, connection] = await answering('');
    const command = shellCommand();

    await shell(connection, command, { timeoutMs: PATIENT_MS });

    expect(set.opened).toEqual([`shell:${command}`]);
  });

  it('answers with everything the command printed', async () => {
    const [, connection] = await answering('processing result : OK [0] succeeded\n');

    const output = await shell(connection, shellCommand(), { timeoutMs: PATIENT_MS });

    expect(output).toBe('processing result : OK [0] succeeded\n');
  });

  it('stops reading at the byte limit it was given', async () => {
    const [, connection] = await answering('x'.repeat(4096));

    const output = await shell(connection, shellCommand(), { limit: 8, timeoutMs: PATIENT_MS });

    expect(output).toBe('xxxxxxxx');
  });

  it('closes the stream even when the command never answers', async () => {
    const [set, connection] = await answering(null);

    await expect(shell(connection, shellCommand(), { timeoutMs: IMPATIENT_MS })).rejects.toThrow(
      /went quiet/,
    );

    await vi.waitFor(
      () => expect(set.received.some((packet) => packet.command === SDB_COMMAND.CLSE)).toBe(true),
      { timeout: PATIENT_MS, interval: 5 },
    );
  });
});
