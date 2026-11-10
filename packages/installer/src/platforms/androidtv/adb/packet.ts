export const A_CNXN = 0x4e584e43;
export const A_AUTH = 0x48545541;
export const A_OPEN = 0x4e45504f;
export const A_OKAY = 0x59414b4f;
export const A_CLSE = 0x45534c43;
export const A_WRTE = 0x45545257;
export const A_STLS = 0x534c5453;

export const AUTH_TOKEN = 1;
export const AUTH_SIGNATURE = 2;
export const AUTH_RSAPUBLICKEY = 3;

export const ADB_VERSION = 0x01000001;
export const HOST_MAX_PAYLOAD = 256 * 1024;

const HEADER_BYTES = 24;
const LARGEST_PAYLOAD = 1024 * 1024;
const KNOWN = new Set([A_CNXN, A_AUTH, A_OPEN, A_OKAY, A_CLSE, A_WRTE, A_STLS]);

export interface Packet {
  command: number;
  arg0: number;
  arg1: number;
  payload: Buffer;
}

function checksum(payload: Buffer): number {
  let sum = 0;
  for (const byte of payload) sum = (sum + byte) >>> 0;
  return sum;
}

/** One adb message: the six little-endian words of its header, then its payload. */
export function encodePacket({ command, arg0, arg1, payload }: Packet): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32LE(command, 0);
  header.writeUInt32LE(arg0 >>> 0, 4);
  header.writeUInt32LE(arg1 >>> 0, 8);
  header.writeUInt32LE(payload.length, 12);
  header.writeUInt32LE(checksum(payload), 16);
  header.writeUInt32LE((command ^ 0xffffffff) >>> 0, 20);
  return Buffer.concat([header, payload]);
}

/**
 * Cuts the bytes a socket delivers into messages. A header that does not
 * check out, or a payload larger than adb ever sends, ends the connection.
 */
export class PacketReader {
  private pending = Buffer.alloc(0);

  push(chunk: Buffer): Packet[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const packets: Packet[] = [];
    while (this.pending.length >= HEADER_BYTES) {
      const command = this.pending.readUInt32LE(0);
      const length = this.pending.readUInt32LE(12);
      const magic = this.pending.readUInt32LE(20);
      if (!KNOWN.has(command) || magic !== (command ^ 0xffffffff) >>> 0) {
        throw new Error('the TV sent something that is not an adb message');
      }
      if (length > LARGEST_PAYLOAD) throw new Error('the TV sent an adb message far too large');
      if (this.pending.length < HEADER_BYTES + length) break;

      packets.push({
        command,
        arg0: this.pending.readUInt32LE(4),
        arg1: this.pending.readUInt32LE(8),
        payload: Buffer.from(this.pending.subarray(HEADER_BYTES, HEADER_BYTES + length)),
      });
      this.pending = this.pending.subarray(HEADER_BYTES + length);
    }
    return packets;
  }
}
