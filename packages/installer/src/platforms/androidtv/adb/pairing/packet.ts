import type { ByteReader } from './bytes';
import { TAG_BYTES } from './cipher';

export const PACKET = { spake2: 0, peerInfo: 1 } as const;
export const PEER = { publicKey: 0, deviceGuid: 1 } as const;
export const PEER_INFO_BYTES = 8192;
export const SEALED_PEER_INFO_BYTES = PEER_INFO_BYTES + TAG_BYTES;
export const HEADER_BYTES = 6;
export const EXPORT_LABEL = 'adb-label\0';
export const EXPORT_BYTES = 64;
export const CLIENT_NAME = Buffer.from('adb pair client\0');
export const SERVER_NAME = Buffer.from('adb pair server\0');

const VERSION = 1;

/** The six bytes before each pairing message: version, type, and the payload's size. */
export function pairingHeader(type: number, size: number): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header[0] = VERSION;
  header[1] = type;
  header.writeUInt32BE(size, 2);
  return header;
}

/** The payload size a pairing header announces, or null when it is not one of `type`. */
export function payloadSize(header: Buffer, type: number, largest: number): number | null {
  if (header.length !== HEADER_BYTES || header[0] !== VERSION || header[1] !== type) {
    return null;
  }
  const size = header.readUInt32BE(2);
  return size > 0 && size <= largest ? size : null;
}

/** What one side tells the other once paired: a type, then its text padded with zeros. */
export function peerInfo(type: number, text: string): Buffer {
  const info = Buffer.alloc(PEER_INFO_BYTES);
  info[0] = type;
  info.write(text.slice(0, PEER_INFO_BYTES - 2), 1, 'utf8');
  return info;
}

/** The payload of the next pairing message, which has to be one of `type`. */
export async function readPacket(
  bytes: ByteReader,
  type: number,
  largest: number,
): Promise<Buffer> {
  const size = payloadSize(await bytes.read(HEADER_BYTES), type, largest);
  if (size === null) {
    throw new Error('the TV answered with something that is not adb pairing');
  }
  return bytes.read(size);
}
