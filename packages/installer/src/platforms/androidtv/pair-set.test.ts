import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mdnsPort } from '../../discovery/mdns';
import { type AdbKey, androidPublicKey, kromaKey } from './adb/key';
import { type FakePairing, fakePairing } from './adb/pairing/fake-pairing.fixture';
import { NoPairingCode, pairingCode, pairSet } from './pair-set';

vi.mock('../../discovery/mdns', () => ({ mdnsPort: vi.fn() }));
vi.mock('./adb/key', async (original) => ({
  ...(await original<typeof import('./adb/key')>()),
  kromaKey: vi.fn(),
}));

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
const ours: AdbKey = { privateKey, publicKey: androidPublicKey(privateKey, 'kroma@test') };

let tv: FakePairing | null = null;

beforeEach(() => {
  vi.mocked(kromaKey).mockResolvedValue(ours);
  vi.mocked(mdnsPort).mockResolvedValue(null);
});

afterEach(async () => {
  vi.resetAllMocks();
  await tv?.close();
  tv = null;
});

describe('pairingCode', () => {
  it('takes six digits, with or without the spaces typed among them', () => {
    expect(pairingCode('701965')).toBe('701965');
    expect(pairingCode(' 701 965\n')).toBe('701965');
  });

  it('takes nothing shorter, longer, or not all digits', () => {
    expect(pairingCode('70196')).toBeNull();
    expect(pairingCode('7019655')).toBeNull();
    expect(pairingCode('70196a')).toBeNull();
    expect(pairingCode('')).toBeNull();
  });
});

describe('pairSet', () => {
  it('pairs the key this tool keeps, on the port the set advertises for its code', async () => {
    tv = await fakePairing('701965');
    vi.mocked(mdnsPort).mockResolvedValue(tv.port);

    await pairSet('127.0.0.1', '701965');

    expect(tv.paired).toEqual([ours.publicKey]);
    expect(vi.mocked(mdnsPort).mock.calls[0]?.slice(0, 2)).toEqual([
      '127.0.0.1',
      '_adb-tls-pairing._tcp',
    ]);
  });

  it('says the set shows no code when it advertises nowhere to send one', async () => {
    const pairing = pairSet('192.168.1.78', '701965', 10);

    await expect(pairing).rejects.toBeInstanceOf(NoPairingCode);
    await expect(pairing).rejects.toThrow('Pair device with pairing code');
  });

  it('passes on the refusal of a set that shows another code', async () => {
    tv = await fakePairing('701965');
    vi.mocked(mdnsPort).mockResolvedValue(tv.port);

    await expect(pairSet('127.0.0.1', '111111')).rejects.toThrow('refused that pairing code');
  });
});
