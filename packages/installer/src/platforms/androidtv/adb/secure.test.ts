import { createPublicKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { createServer, type Server } from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';
import { presented, SERVER_TLS } from './fake-tls.fixture';
import { adbCertificate, secure } from './secure';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });

let server: Server | null = null;

async function listening(onSecure: (shown: boolean, protocol: string | null) => void) {
  const started = createServer(SERVER_TLS, (socket) => {
    onSecure(presented(socket, [privateKey]), socket.getProtocol());
    socket.end();
  });
  server = started;
  await new Promise<void>((resolve) => started.listen(0, '127.0.0.1', resolve));
  const address = started.address();
  return typeof address === 'object' && address ? address.port : 0;
}

afterEach(() => {
  server?.close();
  server = null;
});

describe('adbCertificate', () => {
  it('carries the public half of the key, under the name adb signs with', () => {
    const certificate = new X509Certificate(adbCertificate(privateKey));

    expect(certificate.subject).toBe('C=US\nO=Android\nCN=Adb');
    expect(certificate.issuer).toBe(certificate.subject);
    expect(certificate.publicKey.equals(createPublicKey(privateKey))).toBe(true);
    expect(certificate.verify(createPublicKey(privateKey))).toBe(true);
  });
});

describe('secure', () => {
  it('shows the TV the adb key as its certificate, over TLS 1.3', async () => {
    let seen: (value: [boolean, string | null]) => void = () => undefined;
    const served = new Promise<[boolean, string | null]>((resolve) => {
      seen = resolve;
    });
    const port = await listening((shown, protocol) => seen([shown, protocol]));

    const socket = await secure({ host: '127.0.0.1', port }, privateKey, 2000);
    const shown = await served;
    const protocol = socket.getProtocol();
    socket.destroy();

    expect(protocol).toBe('TLSv1.3');
    expect(shown).toEqual([true, 'TLSv1.3']);
  });

  it('fails when what answers does not speak TLS in time', async () => {
    const port = await listening(() => undefined);
    server?.removeAllListeners('connection');

    await expect(secure({ host: '127.0.0.1', port }, privateKey, 50)).rejects.toThrow(
      'the TV did not finish TLS',
    );
  });

  it('fails when nothing answers at all', async () => {
    const port = await listening(() => undefined);
    server?.close();
    server = null;

    await expect(secure({ host: '127.0.0.1', port }, privateKey, 2000)).rejects.toThrow();
  });
});
