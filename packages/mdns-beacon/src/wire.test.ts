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
});
