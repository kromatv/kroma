const CLASS_CONTEXT = 0xa0;

export const TAG = {
  boolean: 0x01,
  integer: 0x02,
  bitString: 0x03,
  octetString: 0x04,
  null: 0x05,
  oid: 0x06,
  utf8String: 0x0c,
  printableString: 0x13,
  utcTime: 0x17,
  sequence: 0x30,
  set: 0x31,
} as const;

/** A DER value: one tag byte, a length, and the contents. */
export function encode(tag: number, contents: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), length(contents.length), contents]);
}

export const sequence = (...parts: Buffer[]) => encode(TAG.sequence, Buffer.concat(parts));
export const set = (...parts: Buffer[]) => encode(TAG.set, Buffer.concat(parts));
export const nul = () => encode(TAG.null, Buffer.alloc(0));
export const utf8 = (text: string) => encode(TAG.utf8String, Buffer.from(text, 'utf8'));
export const printable = (text: string) => encode(TAG.printableString, Buffer.from(text, 'ascii'));
export const boolean = (value: boolean) => encode(TAG.boolean, Buffer.from([value ? 0xff : 0x00]));
export const octets = (contents: Buffer) => encode(TAG.octetString, contents);

/** Explicit `[n]` tagging, which X.509 uses for its version and extensions. */
export const context = (index: number, contents: Buffer) => encode(CLASS_CONTEXT | index, contents);

/** Two's complement, with a leading zero when the top bit would read as negative. */
export function integer(value: Buffer | number): Buffer {
  const bytes = typeof value === 'number' ? unsigned(value) : value;
  const first = bytes[0] ?? 0;
  return encode(TAG.integer, first & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
}

/** A BIT STRING, whose first byte counts the bits the last byte does not use. */
export const bitString = (contents: Buffer, unused = 0) =>
  encode(TAG.bitString, Buffer.concat([Buffer.from([unused]), contents]));

export function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  const [first = 0, second = 0, ...rest] = parts;
  const bytes = [first * 40 + second];
  for (const part of rest) bytes.push(...base128(part));
  return encode(TAG.oid, Buffer.from(bytes));
}

/** `YYMMDDhhmmssZ`, which is what X.509 dates before 2050 are written as. */
export function utcTime(date: Date): Buffer {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = [
    pad(date.getUTCFullYear() % 100),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
  return encode(TAG.utcTime, Buffer.from(`${stamp}Z`, 'ascii'));
}

function length(size: number): Buffer {
  if (size < 0x80) return Buffer.from([size]);
  const bytes = unsigned(size);
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), bytes]);
}

function unsigned(value: number): Buffer {
  const bytes: number[] = [];
  let rest = value;
  do {
    bytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  } while (rest > 0);
  return Buffer.from(bytes);
}

function base128(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}
