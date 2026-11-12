import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { utils } from 'ssh2';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { devModeKeys, type FakeTv, PASSPHRASE, startFakeTv } from './fake-tv.fixture';
import { openSession } from './session';

let privateKey: string;
let tv: FakeTv | null = null;
let other: Server | null = null;

const listening = (server: Server) =>
  new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

beforeAll(() => {
  const parsed = utils.parseKey(devModeKeys().encrypted, PASSPHRASE);
  if (parsed instanceof Error) throw parsed;
  privateKey = parsed.getPrivatePEM();
});

afterEach(async () => {
  await tv?.close();
  tv = null;
  other?.close();
  other = null;
});

describe('openSession', () => {
  it('runs a command and answers what it printed and how it exited', async () => {
    tv = await startFakeTv();
    const session = await openSession({ host: tv.host, port: tv.sshPort, privateKey });

    const ran = await session.exec('whoami');
    session.end();

    expect(ran).toEqual({ code: 127, stdout: '', stderr: 'sh: whoami: not found\n' });
  });

  it('refuses a command that exited with anything but 0, quoting what it said', async () => {
    tv = await startFakeTv();
    const session = await openSession({ host: tv.host, port: tv.sshPort, privateKey });

    await expect(session.run('whoami')).rejects.toThrow(
      "'whoami' exited with 127: sh: whoami: not found",
    );
    session.end();
  });

  it('tells the user to turn Dev Mode on when nothing listens on its port', async () => {
    other = createServer();
    const port = await listening(other);
    other.close();

    await expect(openSession({ host: '127.0.0.1', port, privateKey })).rejects.toThrow(
      `nothing answered SSH on 127.0.0.1:${port}: open the Dev Mode app and turn Dev Mode on`,
    );
  });

  it('says what went wrong with a port that does not speak SSH', async () => {
    other = createServer((socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
    const port = await listening(other);

    await expect(openSession({ host: '127.0.0.1', port, privateKey })).rejects.toThrow(
      'the SSH session with 127.0.0.1 failed',
    );
  });
});
