import { describe, expect, it } from 'vitest';
import { DNS_TYPE, encodeQuery, parseResponse } from './dns';

const name = (text: string) =>
  Buffer.concat([
    ...text.split('.').flatMap((label) => [Buffer.from([label.length]), Buffer.from(label)]),
    Buffer.from([0]),
  ]);

const record = (owner: Buffer, type: number, data: Buffer) => {
  const fixed = Buffer.alloc(10);
  fixed.writeUInt16BE(type, 0);
  fixed.writeUInt16BE(1, 2);
  fixed.writeUInt16BE(data.length, 8);
  return Buffer.concat([owner, fixed, data]);
};

const response = (answers: Buffer[], additional: Buffer[] = []) => {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(answers.length, 6);
  header.writeUInt16BE(additional.length, 10);
  return Buffer.concat([header, ...answers, ...additional]);
};

const srv = (port: number, target: Buffer) => {
  const fixed = Buffer.alloc(6);
  fixed.writeUInt16BE(port, 4);
  return Buffer.concat([fixed, target]);
};

const SERVICE = '_adb-tls-connect._tcp.local';
const INSTANCE = `adb-2808-cT0TLZ.${SERVICE}`;

describe('encodeQuery', () => {
  it('asks one question per name, each as length-prefixed labels', () => {
    const query = encodeQuery([{ name: SERVICE, type: DNS_TYPE.ptr }]);

    expect(query.readUInt16BE(4)).toBe(1);
    expect(query.subarray(12, 12 + name(SERVICE).length)).toEqual(name(SERVICE));
    expect(query.readUInt16BE(query.length - 4)).toBe(DNS_TYPE.ptr);
    expect(query.readUInt16BE(query.length - 2)).toBe(1);
  });

  it('asks for an answer to this socket alone when told to', () => {
    const query = encodeQuery([{ name: SERVICE, type: DNS_TYPE.ptr }], true);

    expect(query.readUInt16BE(query.length - 2)).toBe(0x8001);
  });

  it('refuses a label longer than DNS carries', () => {
    expect(() => encodeQuery([{ name: `${'a'.repeat(64)}.local`, type: DNS_TYPE.ptr }])).toThrow(
      'too long',
    );
  });
});

describe('parseResponse', () => {
  it('reads the instance a service points at, and the port and address it answers on', () => {
    const message = response(
      [record(name(SERVICE), DNS_TYPE.ptr, name(INSTANCE))],
      [
        record(name(INSTANCE), DNS_TYPE.srv, srv(35221, name('Android.local'))),
        record(name('Android.local'), DNS_TYPE.a, Buffer.from([192, 168, 1, 78])),
      ],
    );

    expect(parseResponse(message)).toEqual([
      { kind: 'ptr', name: SERVICE, target: INSTANCE },
      { kind: 'srv', name: INSTANCE, port: 35221, target: 'Android.local' },
      { kind: 'a', name: 'Android.local', address: '192.168.1.78' },
    ]);
  });

  it('follows a name that points back at one written earlier in the message', () => {
    const pointer = Buffer.from([0xc0, 12]);
    const instance = Buffer.concat([Buffer.from([3]), Buffer.from('adb'), pointer]);
    const message = response([record(name(SERVICE), DNS_TYPE.ptr, instance)]);

    expect(parseResponse(message)).toEqual([
      { kind: 'ptr', name: SERVICE, target: `adb.${SERVICE}` },
    ]);
  });

  it('skips the questions a response repeats, and the record types it does not read', () => {
    const question = Buffer.concat([name(SERVICE), Buffer.from([0, DNS_TYPE.ptr, 0, 1])]);
    const answers = [
      record(name(INSTANCE), DNS_TYPE.txt, Buffer.from('\x05v=ADB')),
      record(name(SERVICE), DNS_TYPE.ptr, name(INSTANCE)),
    ];
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0x8400, 2);
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(2, 6);

    expect(parseResponse(Buffer.concat([header, question, ...answers]))).toEqual([
      { kind: 'ptr', name: SERVICE, target: INSTANCE },
    ]);
  });

  it('reads nothing out of a query', () => {
    expect(parseResponse(encodeQuery([{ name: SERVICE, type: DNS_TYPE.ptr }]))).toEqual([]);
  });

  it('keeps what it read before a record that runs past the message', () => {
    const whole = response([
      record(name(SERVICE), DNS_TYPE.ptr, name(INSTANCE)),
      record(name(INSTANCE), DNS_TYPE.srv, srv(35221, name('Android.local'))),
    ]);

    expect(parseResponse(whole.subarray(0, whole.length - 5))).toEqual([
      { kind: 'ptr', name: SERVICE, target: INSTANCE },
    ]);
  });

  it('gives up on a name that points at itself', () => {
    const loop = Buffer.concat([Buffer.alloc(12), Buffer.from([0xc0, 12])]);
    loop.writeUInt16BE(0x8400, 2);
    loop.writeUInt16BE(1, 6);

    expect(parseResponse(loop)).toEqual([]);
  });

  it('reads nothing out of a message too short or too long to be one', () => {
    expect(parseResponse(Buffer.alloc(5))).toEqual([]);
    expect(parseResponse(Buffer.alloc(10_000, 0x80))).toEqual([]);
  });
});
