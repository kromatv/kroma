// DNS-SD on the wire, as much of it as a television needs to be found.
//
// Enough of RFC 1035 to WRITE a multicast answer and READ a question, and no
// more: this exists so a shell with a Node runtime but no DNS-SD API of its own
// (webOS's JS service, a Tizen service) can raise the same `_kroma-tv._tcp`
// beacon that Apple's NWListener and Android's NsdManager raise natively.
//
// Names are the fiddly part: a name is a sequence of length-prefixed labels
// ending in a zero byte, and a reader must also follow the 0xC0 compression
// pointers that other responders use. Nothing here WRITES a pointer - an
// uncompressed answer is a few dozen bytes larger and every resolver reads it.

export const MDNS_ADDRESS = '224.0.0.251';
export const MDNS_PORT = 5353;

/** Record types, by the numbers the wire uses. */
export const TYPE = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 } as const;
const CLASS_IN = 1;
// Bit 15 of the class field: "this record is authoritative for this name, other
// caches should drop what they have".
const FLUSH = 0x8000;

export interface Question {
  name: string;
  type: number;
}

export interface ServiceRecord {
  /** `Living room`, before any escaping. */
  instance: string;
  /** `_kroma-tv._tcp.local`. */
  type: string;
  /** `kroma-tv-1.local`. */
  host: string;
  port: number;
  txt: Readonly<Record<string, string>>;
  addresses: readonly string[];
  /** Seconds. Zero is a goodbye: it tells every cache to forget the service. */
  ttl: number;
}

function encodeName(name: string): Buffer {
  const parts = name.replace(/\.$/, '').split('.');
  const out: Buffer[] = [];
  for (const part of parts) {
    const label = Buffer.from(part, 'utf8');
    if (label.length > 63) throw new Error(`label too long: ${part}`);
    out.push(Buffer.from([label.length]), label);
  }
  out.push(Buffer.from([0]));
  return Buffer.concat(out);
}

/** Reads a name at `offset`, following compression pointers; returns the name
 *  and where the reader should carry on in the ORIGINAL buffer. */
function decodeName(buf: Buffer, offset: number): { name: string; next: number } {
  const parts: string[] = [];
  let at = offset;
  let next = -1;
  // A malformed packet must not become an infinite loop: every jump has to move
  // backwards, and there are only so many bytes to jump into.
  for (let guard = 0; guard < 128; guard += 1) {
    if (at >= buf.length) break;
    const len = buf[at] ?? 0;
    if (len === 0) {
      at += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      const pointer = ((len & 0x3f) << 8) | (buf[at + 1] ?? 0);
      if (next < 0) next = at + 2;
      if (pointer >= at) break;
      at = pointer;
      continue;
    }
    parts.push(buf.subarray(at + 1, at + 1 + len).toString('utf8'));
    at += 1 + len;
  }
  return { name: parts.join('.'), next: next < 0 ? at : next };
}

function record(name: string, type: number, ttl: number, data: Buffer, flush: boolean): Buffer {
  const head = Buffer.alloc(10);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(flush ? CLASS_IN | FLUSH : CLASS_IN, 2);
  head.writeUInt32BE(ttl, 4);
  head.writeUInt16BE(data.length, 8);
  return Buffer.concat([encodeName(name), head, data]);
}

function txtData(txt: Readonly<Record<string, string>>): Buffer {
  const entries = Object.entries(txt);
  if (entries.length === 0) return Buffer.from([0]);
  return Buffer.concat(
    entries.map(([key, value]) => {
      const line = Buffer.from(`${key}=${value}`, 'utf8');
      if (line.length > 255) throw new Error(`txt entry too long: ${key}`);
      return Buffer.concat([Buffer.from([line.length]), line]);
    }),
  );
}

function srvData(port: number, host: string): Buffer {
  const head = Buffer.alloc(6);
  head.writeUInt16BE(0, 0); // priority
  head.writeUInt16BE(0, 2); // weight
  head.writeUInt16BE(port, 4);
  return Buffer.concat([head, encodeName(host)]);
}

function aData(address: string): Buffer {
  const octets = address.split('.').map((n) => Number.parseInt(n, 10));
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) {
    throw new Error(`not an IPv4 address: ${address}`);
  }
  return Buffer.from(octets);
}

/**
 * The whole answer for one service: the type's PTR, and the instance's SRV, TXT
 * and A records. Sent unprompted to announce, and again whenever someone asks -
 * one packet either way, because a resolver that has to ask twice is a
 * television that takes twice as long to appear.
 */
export function answerPacket(service: ServiceRecord): Buffer {
  const full = `${service.instance}.${service.type}`;
  const answers = [
    record(service.type, TYPE.PTR, service.ttl, encodeName(full), false),
    record(full, TYPE.SRV, service.ttl, srvData(service.port, service.host), true),
    record(full, TYPE.TXT, service.ttl, txtData(service.txt), true),
    ...service.addresses.map((address) =>
      record(service.host, TYPE.A, service.ttl, aData(address), true),
    ),
  ];
  const header = Buffer.alloc(12);
  // A response, authoritative. Query id 0: multicast DNS matches on the
  // question, not on an id.
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(0, 4); // questions
  header.writeUInt16BE(answers.length, 6);
  return Buffer.concat([header, ...answers]);
}

/** The questions in a packet, or an empty list if it is not a query. */
export function readQuestions(buf: Buffer): Question[] {
  if (buf.length < 12) return [];
  const flags = buf.readUInt16BE(2);
  if ((flags & 0x8000) !== 0) return []; // a response, not a question
  const count = buf.readUInt16BE(4);
  const out: Question[] = [];
  let at = 12;
  for (let i = 0; i < count && at < buf.length; i += 1) {
    const { name, next } = decodeName(buf, at);
    at = next;
    if (at + 4 > buf.length) break;
    out.push({ name, type: buf.readUInt16BE(at) });
    at += 4;
  }
  return out;
}

/** Whether a question is asking about this service at all. */
export function asksAbout(question: Question, service: ServiceRecord): boolean {
  const full = `${service.instance}.${service.type}`;
  const named =
    question.name === service.type ||
    question.name === full ||
    question.name === service.host ||
    question.name === '_services._dns-sd._udp.local';
  if (!named) return false;
  return (
    question.type === TYPE.ANY ||
    question.type === TYPE.PTR ||
    question.type === TYPE.SRV ||
    question.type === TYPE.TXT ||
    question.type === TYPE.A
  );
}
