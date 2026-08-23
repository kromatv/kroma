export const SDB_COMMAND = {
  CNXN: 0x4e584e43,
  OPEN: 0x4e45504f,
  OKAY: 0x59414b4f,
  CLSE: 0x45534c43,
  WRTE: 0x45545257,
  AUTH: 0x48545541,
} as const;

export type SdbCommand = (typeof SDB_COMMAND)[keyof typeof SDB_COMMAND];

export const HEADER_BYTES = 24;
export const PROTOCOL_VERSION = 0x00100000;
export const HOST_MAX_DATA = 256 * 1024;
export const HOST_BANNER = 'host::\0';

const NAMES = new Map<number, string>(
  Object.entries(SDB_COMMAND).map(([name, value]) => [value, name]),
);

export interface SdbPacket {
  command: number;
  arg0: number;
  arg1: number;
  data: Buffer;
}

export function commandName(command: number): string {
  return NAMES.get(command) ?? `0x${command.toString(16).padStart(8, '0')}`;
}

export function checksum(data: Buffer): number {
  let total = 0;
  for (const byte of data) total = (total + byte) >>> 0;
  return total;
}

export function encodePacket({ command, arg0, arg1, data }: SdbPacket): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32LE(command >>> 0, 0);
  header.writeUInt32LE(arg0 >>> 0, 4);
  header.writeUInt32LE(arg1 >>> 0, 8);
  header.writeUInt32LE(data.length, 12);
  header.writeUInt32LE(checksum(data), 16);
  header.writeUInt32LE((command ^ 0xffffffff) >>> 0, 20);
  return data.length === 0 ? header : Buffer.concat([header, data]);
}

export interface SdbHeader {
  command: number;
  arg0: number;
  arg1: number;
  length: number;
  checksum: number;
  magic: number;
}

export function decodeHeader(buffer: Buffer): SdbHeader {
  return {
    command: buffer.readUInt32LE(0),
    arg0: buffer.readUInt32LE(4),
    arg1: buffer.readUInt32LE(8),
    length: buffer.readUInt32LE(12),
    checksum: buffer.readUInt32LE(16),
    magic: buffer.readUInt32LE(20),
  };
}

export function headerIsSane(header: SdbHeader, maxData: number): boolean {
  return header.magic === (header.command ^ 0xffffffff) >>> 0 && header.length <= maxData;
}

/**
 * Reassembles packets out of a byte stream. Throws on a header whose magic or
 * payload checksum disagrees, because past that point the stream is desynced
 * and every later frame is noise.
 */
export class PacketReader {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private readonly maxData: number = HOST_MAX_DATA) {}

  push(chunk: Buffer): SdbPacket[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const packets: SdbPacket[] = [];
    for (;;) {
      if (this.buffer.length < HEADER_BYTES) return packets;
      const header = decodeHeader(this.buffer);
      if (!headerIsSane(header, this.maxData)) {
        throw new Error(`sdb: bad frame from the device (${commandName(header.command)})`);
      }
      if (this.buffer.length < HEADER_BYTES + header.length) return packets;

      const data = this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + header.length);
      if (checksum(data) !== header.checksum) throw new Error('sdb: payload checksum mismatch');
      this.buffer = this.buffer.subarray(HEADER_BYTES + header.length);
      packets.push({ command: header.command, arg0: header.arg0, arg1: header.arg1, data });
    }
  }
}
