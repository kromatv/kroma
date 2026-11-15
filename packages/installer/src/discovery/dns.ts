export const DNS_TYPE = { a: 1, ptr: 12, txt: 16, srv: 33 } as const;

const CLASS_IN = 1;
const UNICAST_RESPONSE = 0x8000;
const HEADER_BYTES = 12;
const LARGEST_MESSAGE = 9000;
const LARGEST_NAME_JUMPS = 16;
const MOST_RECORDS = 256;
const POINTER = 0xc0;

export type DnsRecord =
  | { kind: 'ptr'; name: string; target: string }
  | { kind: 'srv'; name: string; port: number; target: string }
  | { kind: 'a'; name: string; address: string };

export interface DnsQuestion {
  name: string;
  type: number;
}

function encodeName(name: string): Buffer {
  const labels = name.split('.').filter(Boolean);
  const parts = labels.flatMap((label) => {
    const text = Buffer.from(label, 'utf8');
    if (text.length > 63) {
      throw new Error(`the DNS label ${label} is too long`);
    }
    return [Buffer.from([text.length]), text];
  });
  return Buffer.concat([...parts, Buffer.from([0])]);
}

/**
 * One DNS query carrying every question given. `unicast` asks an mDNS
 * responder to answer this socket alone, not the whole network.
 */
export function encodeQuery(questions: readonly DnsQuestion[], unicast = false): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16BE(questions.length, 4);
  const asked = questions.map(({ name, type }) => {
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(type, 0);
    tail.writeUInt16BE(unicast ? CLASS_IN | UNICAST_RESPONSE : CLASS_IN, 2);
    return Buffer.concat([encodeName(name), tail]);
  });
  return Buffer.concat([header, ...asked]);
}

function pointedAt(message: Buffer, at: number): number {
  const low = message[at + 1];
  if (low === undefined) {
    throw new Error('a DNS name runs past its message');
  }
  return (((message[at] ?? 0) & ~POINTER) << 8) | low;
}

function labelAt(message: Buffer, at: number, length: number): string {
  if (at + 1 + length > message.length) {
    throw new Error('a DNS label runs past its message');
  }
  return message.toString('utf8', at + 1, at + 1 + length);
}

function readName(message: Buffer, start: number): { name: string; end: number } {
  const labels: string[] = [];
  let at = start;
  let end = -1;
  for (let jumps = 0; jumps <= LARGEST_NAME_JUMPS;) {
    const length = message[at];
    if (length === undefined) {
      throw new Error('a DNS name runs past its message');
    }
    if (length === 0) {
      return { name: labels.join('.'), end: end === -1 ? at + 1 : end };
    }
    if ((length & POINTER) === POINTER) {
      if (end === -1) {
        end = at + 2;
      }
      at = pointedAt(message, at);
      jumps += 1;
    } else {
      labels.push(labelAt(message, at, length));
      at += 1 + length;
    }
  }
  throw new Error('a DNS name loops');
}

function readRecord(message: Buffer, start: number): { record: DnsRecord | null; end: number } {
  const { name, end: fixed } = readName(message, start);
  if (fixed + 10 > message.length) {
    throw new Error('a DNS record runs past its message');
  }
  const type = message.readUInt16BE(fixed);
  const size = message.readUInt16BE(fixed + 8);
  const data = fixed + 10;
  const end = data + size;
  if (end > message.length) {
    throw new Error('a DNS record runs past its message');
  }

  if (type === DNS_TYPE.ptr) {
    return { record: { kind: 'ptr', name, target: readName(message, data).name }, end };
  }
  if (type === DNS_TYPE.srv && size >= 7) {
    const target = readName(message, data + 6).name;
    return { record: { kind: 'srv', name, port: message.readUInt16BE(data + 4), target }, end };
  }
  if (type === DNS_TYPE.a && size === 4) {
    return {
      record: { kind: 'a', name, address: [...message.subarray(data, end)].join('.') },
      end,
    };
  }
  return { record: null, end };
}

/**
 * The PTR, SRV and A records of a DNS response, from every section. A query,
 * or a message that does not parse, holds none.
 */
export function parseResponse(message: Buffer): DnsRecord[] {
  if (message.length < HEADER_BYTES || message.length > LARGEST_MESSAGE) {
    return [];
  }
  if ((message.readUInt16BE(2) & 0x8000) === 0) {
    return [];
  }
  const questions = message.readUInt16BE(4);
  const total = message.readUInt16BE(6) + message.readUInt16BE(8) + message.readUInt16BE(10);
  const records: DnsRecord[] = [];
  try {
    let at = HEADER_BYTES;
    for (let asked = 0; asked < questions; asked += 1) {
      at = readName(message, at).end + 4;
    }
    for (let read = 0; read < Math.min(total, MOST_RECORDS); read += 1) {
      const { record, end } = readRecord(message, at);
      if (record) {
        records.push(record);
      }
      at = end;
    }
  } catch {
    return records;
  }
  return records;
}
