import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AdbConnection, AdbUnauthorized, parseBanner } from './connection';
import { answers, type FakeAdbd, fakeAdbd } from './fake-adbd.fixture';
import { type AdbKey, androidPublicKey } from './key';

const makeKey = (): AdbKey => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
  return { privateKey, publicKey: androidPublicKey(privateKey, 'kroma@test') };
};
const trustedKey = makeKey();
const strangerKey = makeKey();

let fake: FakeAdbd | null = null;
let connection: AdbConnection | null = null;

async function connectTo(
  options: Parameters<typeof fakeAdbd>[0],
  handshake: Partial<Parameters<typeof AdbConnection.open>[2]> = {},
): Promise<AdbConnection> {
  fake = await fakeAdbd(options);
  connection = await AdbConnection.open('127.0.0.1', fake.port, {
    keys: [trustedKey],
    timeoutMs: 2000,
    ...handshake,
  });
  return connection;
}

afterEach(async () => {
  connection?.close();
  connection = null;
  await fake?.close();
  fake = null;
});

describe('parseBanner', () => {
  it('reads the properties and features a TV announces', () => {
    const banner = parseBanner(
      Buffer.from('device::ro.product.model=SHIELD;ro.product.name=foster;features=cmd,shell_v2\0'),
    );

    expect(banner.props['ro.product.model']).toBe('SHIELD');
    expect(banner.features).toEqual(['cmd', 'shell_v2']);
  });

  it('answers no feature for a TV that announces none', () => {
    expect(parseBanner(Buffer.from('device::')).features).toEqual([]);
  });
});

describe('AdbConnection.open', () => {
  it('lets in a computer whose key the TV trusts, and reads what the TV says', async () => {
    const opened = await connectTo({ trusted: [trustedKey.privateKey], maxData: 8192 });

    expect(opened.banner.props['ro.product.model']).toBe('Fake TV');
    expect(opened.maxPayload).toBe(8192);
    expect(fake?.prompts).toEqual([]);
  });

  it('tries the next key when the TV does not trust the first', async () => {
    const opened = await connectTo(
      { trusted: [trustedKey.privateKey] },
      { keys: [strangerKey, trustedKey] },
    );

    expect(opened.banner.features).toEqual(['cmd']);
  });

  it('connects to a TV that asks for no key at all', async () => {
    expect((await connectTo({})).banner.props['ro.product.model']).toBe('Fake TV');
  });

  it('refuses without asking when the TV trusts no key and asking is not allowed', async () => {
    await expect(
      connectTo({ trusted: [trustedKey.privateKey] }, { keys: [strangerKey] }),
    ).rejects.toBeInstanceOf(AdbUnauthorized);
    expect(fake?.prompts).toEqual([]);
  });

  it('sends its public key and waits for the owner to accept it on the TV', async () => {
    let asked = 0;

    await connectTo(
      { trusted: [trustedKey.privateKey], acceptPrompt: true },
      { keys: [strangerKey], onPrompt: () => (asked += 1) },
    );

    expect(asked).toBe(1);
    expect(fake?.prompts).toEqual([`${strangerKey.publicKey}\0`]);
  });

  it('gives up when nobody accepts the prompt in time', async () => {
    await expect(
      connectTo(
        { trusted: [trustedKey.privateKey] },
        { keys: [strangerKey], onPrompt: () => undefined, promptTimeoutMs: 50 },
      ),
    ).rejects.toThrow('nobody allowed this computer on the TV within two minutes');
  });

  it('says so when the TV wants Wireless debugging with a pairing code', async () => {
    await expect(connectTo({ tls: true })).rejects.toThrow('pairing code');
  });

  it('says so when the TV stops answering', async () => {
    await expect(connectTo({ silent: true }, { timeoutMs: 100 })).rejects.toThrow(
      'stopped answering adb',
    );
  });

  it('fails when nothing listens on the port', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const address = closed.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise((resolve) => closed.close(resolve));

    await expect(
      AdbConnection.open('127.0.0.1', port, { keys: [trustedKey], timeoutMs: 1000 }),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('fails when the TV sends something that is not adb', async () => {
    const sockets: Socket[] = [];
    const liar = createServer((socket) => {
      sockets.push(socket);
      socket.write(Buffer.alloc(24, 1));
    });
    await new Promise<void>((resolve) => liar.listen(0, '127.0.0.1', resolve));
    const address = liar.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const opening = AdbConnection.open('127.0.0.1', port, { keys: [trustedKey], timeoutMs: 1000 });

    await expect(opening).rejects.toThrow('not an adb message');
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => liar.close(resolve));
  });
});

describe('AdbConnection.open, a service', () => {
  it('reads what a service answers until it closes', async () => {
    const opened = await connectTo({ services: { 'shell:echo hi': answers('hi\n') } });

    const stream = await opened.open('shell:echo hi');

    expect((await stream.readAll(1024)).toString()).toBe('hi\n');
  });

  it('says so when the TV refuses to open a service', async () => {
    const opened = await connectTo({});

    await expect(opened.open('shell:nothing')).rejects.toThrow(
      'the TV refused to open shell:nothing',
    );
  });

  it('cuts a write larger than the TV accepts into pieces it takes one at a time', async () => {
    const pieces: number[] = [];
    const opened = await connectTo({
      maxData: 1000,
      services: {
        'exec:cat': (side) => {
          side.onData = (data) => {
            pieces.push(data.length);
            if (pieces.reduce((a, b) => a + b) === 2500) side.close();
          };
        },
      },
    });

    const stream = await opened.open('exec:cat');
    await stream.write(Buffer.alloc(2500, 1));

    expect(pieces).toEqual([1000, 1000, 500]);
  });

  it('keeps what it read past the length asked for, for the next read', async () => {
    const opened = await connectTo({ services: { 'shell:abc': answers('abcdef') } });
    const stream = await opened.open('shell:abc');

    expect((await stream.readExactly(2)).toString()).toBe('ab');
    expect((await stream.readExactly(4)).toString()).toBe('cdef');
    await expect(stream.readExactly(1)).rejects.toThrow('closed the stream early');
  });

  it('refuses an answer far longer than expected', async () => {
    const opened = await connectTo({ services: { 'shell:big': answers('x'.repeat(2000)) } });
    const stream = await opened.open('shell:big');

    await expect(stream.readAll(100)).rejects.toThrow('far more than expected');
  });

  it('fails a read when the connection drops under it', async () => {
    const opened = await connectTo({ services: { 'shell:wait': () => undefined } });
    const stream = await opened.open('shell:wait');

    const reading = stream.read();
    await fake?.close();

    await expect(reading).rejects.toThrow('closed the adb connection');
  });

  it('fails a write the TV closed the stream on', async () => {
    const opened = await connectTo({ services: { 'shell:gone': (side) => side.close() } });
    const stream = await opened.open('shell:gone');
    await stream.read();

    await expect(stream.write(Buffer.from('late'))).rejects.toThrow('closed the stream');
  });
});
