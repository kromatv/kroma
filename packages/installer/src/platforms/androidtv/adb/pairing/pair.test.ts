import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';
import { SERVER_TLS } from '../fake-tls.fixture';
import { type AdbKey, androidPublicKey } from '../key';
import { type FakePairing, fakePairing } from './fake-pairing.fixture';
import { PairingRefused, pairWithCode } from './pair';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
const key: AdbKey = { privateKey, publicKey: androidPublicKey(privateKey, 'kroma@test') };

let tv: FakePairing | null = null;
let other: Server | null = null;

afterEach(async () => {
  await tv?.close();
  tv = null;
  other?.close();
  other = null;
});

describe('pairWithCode', () => {
  it('hands the TV this computer key under the code it shows, and answers the name of the TV', async () => {
    tv = await fakePairing('701965', 'adb-2808105GN-cT0TLZ');

    const guid = await pairWithCode({ host: '127.0.0.1', port: tv.port, code: '701965', key });

    expect(guid).toBe('adb-2808105GN-cT0TLZ');
    expect(tv.paired).toEqual([key.publicKey]);
  });

  it('says the TV refused a code that is not the one on screen', async () => {
    tv = await fakePairing('701965');

    const pairing = pairWithCode({ host: '127.0.0.1', port: tv.port, code: '000000', key });

    await expect(pairing).rejects.toBeInstanceOf(PairingRefused);
    expect(tv.paired).toEqual([]);
  });

  it('says so when what answers is not a pairing server', async () => {
    const server = createServer(SERVER_TLS, (socket) => socket.end('HTTP/1.1 400 Bad Request\r\n'));
    other = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const pairing = pairWithCode({ host: '127.0.0.1', port, code: '701965', key });

    await expect(pairing).rejects.toThrow('not adb pairing');
  });

  it('fails when nothing listens for a code any more', async () => {
    tv = await fakePairing('701965');
    const port = tv.port;
    await tv.close();
    tv = null;

    await expect(pairWithCode({ host: '127.0.0.1', port, code: '701965', key })).rejects.toThrow();
  });
});
