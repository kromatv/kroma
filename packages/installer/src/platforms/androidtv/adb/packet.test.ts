import { describe, expect, it } from 'vitest';
import { A_CNXN, A_WRTE, encodePacket, PacketReader } from './packet';

const message = encodePacket({ command: A_WRTE, arg0: 7, arg1: 9, payload: Buffer.from('hello') });

describe('encodePacket', () => {
  it('writes the six header words little-endian, the byte sum and the magic', () => {
    expect(message.readUInt32LE(0)).toBe(A_WRTE);
    expect(message.readUInt32LE(12)).toBe(5);
    expect(message.readUInt32LE(16)).toBe([...Buffer.from('hello')].reduce((a, b) => a + b));
    expect(message.readUInt32LE(20)).toBe((A_WRTE ^ 0xffffffff) >>> 0);
    expect(message.subarray(24).toString()).toBe('hello');
  });
});

describe('PacketReader', () => {
  it('reads back what was written, even split across several chunks', () => {
    const reader = new PacketReader();

    const first = reader.push(message.subarray(0, 10));
    const rest = reader.push(Buffer.concat([message.subarray(10), message]));

    expect(first).toEqual([]);
    expect(rest).toHaveLength(2);
    expect(rest[0]).toEqual({ command: A_WRTE, arg0: 7, arg1: 9, payload: Buffer.from('hello') });
  });

  it('waits for a payload that has not all arrived', () => {
    const reader = new PacketReader();

    expect(reader.push(message.subarray(0, 26))).toEqual([]);
    expect(reader.push(message.subarray(26))).toHaveLength(1);
  });

  it('refuses a header whose magic does not match its command', () => {
    const broken = Buffer.from(message);
    broken.writeUInt32LE(0, 20);

    expect(() => new PacketReader().push(broken)).toThrow('not an adb message');
  });

  it('refuses a command adb does not have', () => {
    const unknown = Buffer.from(message);
    unknown.writeUInt32LE(0x12345678, 0);
    unknown.writeUInt32LE((0x12345678 ^ 0xffffffff) >>> 0, 20);

    expect(() => new PacketReader().push(unknown)).toThrow('not an adb message');
  });

  it('refuses a payload larger than adb ever sends', () => {
    const huge = encodePacket({ command: A_CNXN, arg0: 0, arg1: 0, payload: Buffer.alloc(0) });
    huge.writeUInt32LE(2 * 1024 * 1024, 12);

    expect(() => new PacketReader().push(huge)).toThrow('far too large');
  });
});
