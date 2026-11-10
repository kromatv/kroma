import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { AdbConnection } from './connection';
import { answers, type FakeAdbd, fakeAdbd, type Service, takes } from './fake-adbd.fixture';
import { installApk, shell } from './install-apk';

const base = mkdtempSync(join(tmpdir(), 'kroma-adb-apk-'));
const apk = join(base, 'KROMA.apk');
writeFileSync(apk, Buffer.alloc(150_000, 3));

let fake: FakeAdbd | null = null;
let connection: AdbConnection | null = null;

async function connectTo(features: string[], services: Record<string, Service>) {
  fake = await fakeAdbd({ features, services, maxData: 64 * 1024 });
  connection = await AdbConnection.open('127.0.0.1', fake.port, { keys: [] });
  return connection;
}

function syncReceiver(answer: Buffer): Service {
  return (side) => {
    let pending = Buffer.alloc(0);
    side.onData = (data) => {
      pending = Buffer.concat([pending, data]);
      while (pending.length >= 8) {
        const id = pending.toString('ascii', 0, 4);
        const length = pending.readUInt32LE(4);
        if (id === 'DONE') {
          side.write(answer);
          pending = pending.subarray(8);
        } else if (id === 'QUIT') {
          side.close();
          return;
        } else if (pending.length >= 8 + length) {
          pending = pending.subarray(8 + length);
        } else return;
      }
    };
  };
}

const okay = Buffer.from('OKAY\0\0\0\0', 'binary');

afterEach(async () => {
  connection?.close();
  await fake?.close();
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('shell', () => {
  it('answers what the command printed', async () => {
    const opened = await connectTo([], {
      'shell:getprop ro.build.version.release': answers('12\n'),
    });

    expect(await shell(opened, 'getprop ro.build.version.release')).toBe('12\n');
  });
});

describe('installApk', () => {
  it('streams the package to the package manager on a TV that has cmd', async () => {
    const opened = await connectTo(['cmd'], {
      "exec:cmd package 'install' '-r' -S 150000": takes(150_000, 'Success\n'),
    });
    const reported: number[] = [];

    const answer = await installApk(opened, apk, (sent) => reported.push(sent));

    expect(answer).toBe('Success\n');
    expect(reported.at(-1)).toBe(150_000);
  });

  it('copies the package first on an older TV, installs it, then removes the copy', async () => {
    const opened = await connectTo([], {
      'sync:': syncReceiver(okay),
      'shell:pm install -r /data/local/tmp/kroma.apk': answers('Success\n'),
      'shell:rm -f /data/local/tmp/kroma.apk': answers(''),
    });

    const answer = await installApk(opened, apk);

    expect(answer).toBe('Success\n');
    expect(fake?.opened).toEqual([
      'sync:',
      'shell:pm install -r /data/local/tmp/kroma.apk',
      'shell:rm -f /data/local/tmp/kroma.apk',
    ]);
  });

  it('says why the TV refused the copy', async () => {
    const reason = Buffer.from('no space left');
    const fail = Buffer.concat([Buffer.from('FAIL'), Buffer.alloc(4), reason]);
    fail.writeUInt32LE(reason.length, 4);
    const opened = await connectTo([], { 'sync:': syncReceiver(fail) });

    await expect(installApk(opened, apk)).rejects.toThrow(
      'the TV refused /data/local/tmp/kroma.apk: no space left',
    );
  });

  it('says so when the TV answers the copy with something unexpected', async () => {
    const opened = await connectTo([], { 'sync:': syncReceiver(Buffer.from('WHAT\0\0\0\0')) });

    await expect(installApk(opened, apk)).rejects.toThrow('with WHAT');
  });
});
