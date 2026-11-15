import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ByteReader } from './bytes';
import {
  PACKET,
  PEER,
  PEER_INFO_BYTES,
  pairingHeader,
  payloadSize,
  peerInfo,
  readPacket,
} from './packet';

describe('pairingHeader', () => {
  it('writes the version, the type, and the size of the payload big-endian', () => {
    expect(pairingHeader(PACKET.peerInfo, 8208)).toEqual(Buffer.from([1, 1, 0, 0, 0x20, 0x10]));
  });
});

describe('payloadSize', () => {
  it('reads the size out of a header of the type expected', () => {
    expect(payloadSize(pairingHeader(PACKET.spake2, 32), PACKET.spake2, 32)).toBe(32);
  });

  it('answers nothing for a header of another type, another version, or another length', () => {
    const versionTwo = pairingHeader(PACKET.spake2, 32);
    versionTwo[0] = 2;

    expect(payloadSize(pairingHeader(PACKET.peerInfo, 32), PACKET.spake2, 32)).toBeNull();
    expect(payloadSize(versionTwo, PACKET.spake2, 32)).toBeNull();
    expect(payloadSize(Buffer.alloc(5), PACKET.spake2, 32)).toBeNull();
  });

  it('answers nothing for a payload that is empty, or larger than the message allows', () => {
    expect(payloadSize(pairingHeader(PACKET.spake2, 0), PACKET.spake2, 32)).toBeNull();
    expect(payloadSize(pairingHeader(PACKET.spake2, 33), PACKET.spake2, 32)).toBeNull();
  });
});

describe('peerInfo', () => {
  it('pads the text with zeros to the size adb exchanges, after one byte of type', () => {
    const info = peerInfo(PEER.publicKey, 'QAAAA kroma@test');

    expect(info).toHaveLength(PEER_INFO_BYTES);
    expect(info[0]).toBe(PEER.publicKey);
    expect(info.toString('utf8', 1, 17)).toBe('QAAAA kroma@test');
    expect(info.subarray(17).every((byte) => byte === 0)).toBe(true);
  });

  it('always ends on a zero, however long the text', () => {
    const info = peerInfo(PEER.deviceGuid, 'x'.repeat(10_000));

    expect(info).toHaveLength(PEER_INFO_BYTES);
    expect(info.at(-1)).toBe(0);
  });
});

describe('readPacket', () => {
  it('reads the payload the header announces', async () => {
    const socket = new PassThrough();
    socket.write(Buffer.concat([pairingHeader(PACKET.spake2, 3), Buffer.from('abc')]));

    const payload = await readPacket(new ByteReader(socket, 500), PACKET.spake2, 32);

    expect(payload.toString()).toBe('abc');
  });

  it('refuses a message that is not the one expected', async () => {
    const socket = new PassThrough();
    socket.write(Buffer.from('HTTP/1.1 400 Bad Request'));

    await expect(readPacket(new ByteReader(socket, 500), PACKET.spake2, 32)).rejects.toThrow(
      'not adb pairing',
    );
  });
});
