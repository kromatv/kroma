import { describe, expect, it } from 'vitest';
import { answerPacket, asksAbout, readQuestions, type ServiceRecord, TYPE } from './wire';

const SERVICE: ServiceRecord = {
  instance: 'Salon',
  type: '_kroma-tv._tcp.local',
  host: 'salon.local',
  port: 8080,
  txt: { proof: 'abc123', v: '1' },
  addresses: ['192.168.1.42'],
  ttl: 120,
};

/** The question section of a real query, written the way a resolver writes it. */
function query(name: string, type: number): Buffer {
  const labels = name
    .split('.')
    .flatMap((part) => [Buffer.from([part.length]), Buffer.from(part, 'utf8')]);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(type, 0);
  tail.writeUInt16BE(1, 2);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  return Buffer.concat([header, ...labels, Buffer.from([0]), tail]);
}

describe('answerPacket', () => {
  it('answers with the PTR, SRV, TXT and A of one service', () => {
    const packet = answerPacket(SERVICE);
    expect(packet.readUInt16BE(2)).toBe(0x8400); // response, authoritative
    expect(packet.readUInt16BE(4)).toBe(0); // no questions
    expect(packet.readUInt16BE(6)).toBe(4); // ptr + srv + txt + one address
    const text = packet.toString('utf8');
    expect(text).toContain('_kroma-tv');
    expect(text).toContain('Salon');
    expect(text).toContain('proof=abc123');
  });

  it('carries the port and the address in the bytes a resolver reads', () => {
    const packet = answerPacket(SERVICE);
    // The SRV port sits three fields into its record; find it by the address
    // instead, which is unambiguous: four raw octets.
    expect(packet.includes(Buffer.from([192, 168, 1, 42]))).toBe(true);
    expect(packet.includes(Buffer.from([0x1f, 0x90]))).toBe(true); // 8080
  });

  it('says goodbye with a zero TTL rather than by going quiet', () => {
    const bye = answerPacket({ ...SERVICE, ttl: 0 });
    // The first answer's TTL is the four bytes after its type and class.
    const at = bye.indexOf(Buffer.from([0x00, TYPE.PTR]));
    expect(bye.readUInt32BE(at + 4)).toBe(0);
  });
});

describe('readQuestions', () => {
  it('reads the name and type a resolver asked for', () => {
    expect(readQuestions(query('_kroma-tv._tcp.local', TYPE.PTR))).toEqual([
      { name: '_kroma-tv._tcp.local', type: TYPE.PTR },
    ]);
  });

  it('ignores a response: only questions are ours to answer', () => {
    expect(readQuestions(answerPacket(SERVICE))).toEqual([]);
  });

  it('does not loop on a malformed packet', () => {
    const bad = Buffer.alloc(20);
    bad.writeUInt16BE(1, 4);
    bad.writeUInt8(0xc0, 12); // a pointer to itself
    bad.writeUInt8(12, 13);
    expect(() => readQuestions(bad)).not.toThrow();
  });
});

describe('answerPacket rejects what no resolver could read', () => {
  it('refuses a label past the 63-byte limit rather than writing a truncated name', () => {
    expect(() => answerPacket({ ...SERVICE, instance: 'x'.repeat(64) })).toThrow(/label too long/);
  });

  it('refuses a TXT entry past 255 bytes', () => {
    expect(() => answerPacket({ ...SERVICE, txt: { proof: 'x'.repeat(300) } })).toThrow(
      /txt entry too long/,
    );
  });

  it('refuses an address that is not IPv4', () => {
    expect(() => answerPacket({ ...SERVICE, addresses: ['fe80::1'] })).toThrow(/not an IPv4/);
    expect(() => answerPacket({ ...SERVICE, addresses: ['192.168.1'] })).toThrow(/not an IPv4/);
  });

  it('writes an empty TXT as a single empty string', () => {
    const packet = answerPacket({ ...SERVICE, txt: {}, addresses: [] });
    expect(packet.readUInt16BE(6)).toBe(3);
    expect(packet.includes(Buffer.from('proof'))).toBe(false);
  });
});

describe('readQuestions on packets a stranger sent', () => {
  it('ignores anything too short to be a header', () => {
    expect(readQuestions(Buffer.alloc(4))).toEqual([]);
  });

  it('follows a backwards compression pointer to the name it names', () => {
    const name = Buffer.concat([
      Buffer.from([9]),
      Buffer.from('_kroma-tv'),
      Buffer.from([4]),
      Buffer.from('_tcp'),
      Buffer.from([5]),
      Buffer.from('local'),
      Buffer.from([0]),
    ]);
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(TYPE.PTR, 0);
    tail.writeUInt16BE(1, 2);
    const header = Buffer.alloc(12);
    header.writeUInt16BE(2, 4);
    const pointer = Buffer.from([0xc0, 12]);
    const packet = Buffer.concat([header, name, tail, pointer, tail]);

    expect(readQuestions(packet)).toEqual([
      { name: '_kroma-tv._tcp.local', type: TYPE.PTR },
      { name: '_kroma-tv._tcp.local', type: TYPE.PTR },
    ]);
  });

  it('stops rather than reading past the end of a truncated question', () => {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(1, 4);
    const truncated = Buffer.concat([
      header,
      Buffer.from([5]),
      Buffer.from('local'),
      Buffer.from([0]),
      Buffer.from([0x00]),
    ]);
    expect(readQuestions(truncated)).toEqual([]);
  });

  it('trusts the question count no further than the bytes that follow it', () => {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(50, 4);
    expect(readQuestions(Buffer.concat([header, query('a.local', TYPE.PTR).subarray(12)]))).toEqual(
      [{ name: 'a.local', type: TYPE.PTR }],
    );
  });
});

describe('asksAbout', () => {
  it('answers the service type, the instance, the host and the meta-query', () => {
    for (const name of [
      '_kroma-tv._tcp.local',
      'Salon._kroma-tv._tcp.local',
      'salon.local',
      '_services._dns-sd._udp.local',
    ]) {
      expect(asksAbout({ name, type: TYPE.PTR }, SERVICE)).toBe(true);
    }
  });

  it('stays quiet for someone else’s service', () => {
    expect(asksAbout({ name: '_airplay._tcp.local', type: TYPE.PTR }, SERVICE)).toBe(false);
  });

  it('answers every record type it can supply, and no other', () => {
    for (const type of [TYPE.ANY, TYPE.PTR, TYPE.SRV, TYPE.TXT, TYPE.A]) {
      expect(asksAbout({ name: SERVICE.type, type }, SERVICE)).toBe(true);
    }
    expect(asksAbout({ name: SERVICE.type, type: 28 }, SERVICE)).toBe(false);
  });
});
