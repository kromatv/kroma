import { describe, expect, it } from 'vitest';
import {
  checksum,
  commandName,
  decodeHeader,
  encodePacket,
  HEADER_BYTES,
  HOST_BANNER,
  HOST_MAX_DATA,
  headerIsSane,
  PacketReader,
  PROTOCOL_VERSION,
  SDB_COMMAND,
} from './packet';

const connect = () => ({
  command: SDB_COMMAND.CNXN,
  arg0: PROTOCOL_VERSION,
  arg1: HOST_MAX_DATA,
  data: Buffer.from(HOST_BANNER, 'utf8'),
});

describe('the header', () => {
  it('survives an encode and decode round trip', () => {
    const packet = connect();

    const header = decodeHeader(encodePacket(packet));

    expect(header.command).toBe(SDB_COMMAND.CNXN);
    expect(header.arg0).toBe(PROTOCOL_VERSION);
    expect(header.arg1).toBe(HOST_MAX_DATA);
    expect(header).toHaveLength(packet.data.length);
  });

  it('is 24 bytes ahead of the payload', () => {
    const encoded = encodePacket(connect());

    expect(encoded).toHaveLength(HEADER_BYTES + HOST_BANNER.length);
    expect(encoded.subarray(HEADER_BYTES).toString('utf8')).toBe(HOST_BANNER);
  });

  it('carries the magic as the command inverted', () => {
    const header = decodeHeader(encodePacket(connect()));

    expect(header.magic).toBe((SDB_COMMAND.CNXN ^ 0xffffffff) >>> 0);
    expect(headerIsSane(header, HOST_MAX_DATA)).toBe(true);
  });

  it('rejects a header whose magic does not invert its command', () => {
    const encoded = encodePacket(connect());
    encoded.writeUInt32LE(0, 20);

    expect(headerIsSane(decodeHeader(encoded), HOST_MAX_DATA)).toBe(false);
  });

  it('rejects a payload longer than the negotiated maximum', () => {
    const encoded = encodePacket(connect());
    encoded.writeUInt32LE(HOST_MAX_DATA + 1, 12);

    expect(headerIsSane(decodeHeader(encoded), HOST_MAX_DATA)).toBe(false);
  });
});

describe('the checksum', () => {
  it('is the sum of every payload byte', () => {
    expect(checksum(Buffer.from([1, 2, 3]))).toBe(6);
    expect(checksum(Buffer.alloc(0))).toBe(0);
  });

  it('sums bytes rather than characters', () => {
    expect(checksum(Buffer.from('host::\0', 'utf8'))).toBe(562);
  });
});

describe('the reader', () => {
  it('yields a packet once the whole payload has arrived', () => {
    const reader = new PacketReader();
    const encoded = encodePacket(connect());

    const first = reader.push(encoded.subarray(0, 10));
    const second = reader.push(encoded.subarray(10));

    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
    expect(second[0]?.data.toString('utf8')).toBe(HOST_BANNER);
  });

  it('yields several packets out of one chunk', () => {
    const reader = new PacketReader();
    const okay = { command: SDB_COMMAND.OKAY, arg0: 1, arg1: 2, data: Buffer.alloc(0) };

    const packets = reader.push(Buffer.concat([encodePacket(okay), encodePacket(connect())]));

    expect(packets.map((packet) => packet.command)).toEqual([SDB_COMMAND.OKAY, SDB_COMMAND.CNXN]);
  });

  it('throws on a frame the device could not have sent', () => {
    const reader = new PacketReader();
    const encoded = encodePacket(connect());
    encoded.writeUInt32LE(0xdeadbeef, 20);

    expect(() => reader.push(encoded)).toThrow(/bad frame/);
  });

  it('throws when the payload does not match its checksum', () => {
    const reader = new PacketReader();
    const encoded = encodePacket(connect());
    encoded.writeUInt32LE(0, 16);

    expect(() => reader.push(encoded)).toThrow(/checksum/);
  });
});

describe('a command name', () => {
  it('reads back as the four letters on the wire', () => {
    expect(commandName(SDB_COMMAND.WRTE)).toBe('WRTE');
    expect(commandName(SDB_COMMAND.CLSE)).toBe('CLSE');
  });

  it('falls back to hex for anything unknown', () => {
    expect(commandName(0x12345678)).toBe('0x12345678');
  });
});
