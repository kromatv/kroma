import { createHash, randomBytes } from 'node:crypto';

const P = 2n ** 255n - 19n;
const ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;
const D = mod(-121665n * power(121666n, P - 2n));
const SQRT_MINUS_ONE = power(2n, (P - 1n) / 4n);
const COFACTOR = 8n;
const POINT_BYTES = 32;

interface Point {
  x: bigint;
  y: bigint;
  z: bigint;
  t: bigint;
}

function mod(value: bigint, modulus = P): bigint {
  const rest = value % modulus;
  return rest < 0n ? rest + modulus : rest;
}

function power(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let square = mod(base);
  for (let rest = exponent; rest > 0n; rest >>= 1n) {
    if (rest & 1n) {
      result = mod(result * square);
    }
    square = mod(square * square);
  }
  return result;
}

function fromLittleEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let at = bytes.length - 1; at >= 0; at -= 1) {
    value = (value << 8n) | BigInt(bytes[at] ?? 0);
  }
  return value;
}

function toLittleEndian(value: bigint, length: number): Buffer {
  const out = Buffer.alloc(length);
  let rest = value;
  for (let at = 0; at < length; at += 1) {
    out[at] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function add(a: Point, b: Point): Point {
  const left = mod((a.y - a.x) * (b.y - b.x));
  const right = mod((a.y + a.x) * (b.y + b.x));
  const cross = mod(2n * D * a.t * b.t);
  const depth = mod(2n * a.z * b.z);
  const e = right - left;
  const f = depth - cross;
  const g = depth + cross;
  const h = right + left;
  return { x: mod(e * f), y: mod(g * h), z: mod(f * g), t: mod(e * h) };
}

function negate(point: Point): Point {
  return { x: mod(-point.x), y: point.y, z: point.z, t: mod(-point.t) };
}

function multiply(scalar: bigint, point: Point): Point {
  let result: Point = { x: 0n, y: 1n, z: 1n, t: 0n };
  let doubled = point;
  for (let rest = scalar; rest > 0n; rest >>= 1n) {
    if (rest & 1n) {
      result = add(result, doubled);
    }
    doubled = add(doubled, doubled);
  }
  return result;
}

function encode(point: Point): Buffer {
  const inverse = power(point.z, P - 2n);
  const x = mod(point.x * inverse);
  const out = toLittleEndian(mod(point.y * inverse), POINT_BYTES);
  out[POINT_BYTES - 1] = (out[POINT_BYTES - 1] ?? 0) | (Number(x & 1n) << 7);
  return out;
}

function decode(bytes: Uint8Array): Point | null {
  if (bytes.length !== POINT_BYTES) {
    return null;
  }
  const y = mod(fromLittleEndian(bytes) & (2n ** 255n - 1n));
  const u = mod(y * y - 1n);
  const v = mod(D * y * y + 1n);
  const wanted = mod(u * power(v, P - 2n));
  let x = power(wanted, (P + 3n) / 8n);
  if (mod(x * x) !== wanted) {
    x = mod(x * SQRT_MINUS_ONE);
  }
  if (mod(x * x) !== wanted) {
    return null;
  }
  if (Number(x & 1n) !== (bytes[POINT_BYTES - 1] ?? 0) >> 7) {
    x = mod(-x);
  }
  return { x, y, z: 1n, t: mod(x * y) };
}

function constant(hex: string): Point {
  const point = decode(Buffer.from(hex, 'hex'));
  if (!point) {
    throw new Error('a SPAKE2 constant is not on the curve');
  }
  return point;
}

const BASE = constant('5866666666666666666666666666666666666666666666666666666666666666');
const M = constant('5ada7e4bf6ddd9adb6626d32131c6b5c51a1e347a3478f53cfcf441b88eed12e');
const N = constant('10e3df0ae37d8e7a99b5fe74b44672103dbddcbd06af680d71329a11693bc778');

function lengthPrefixed(data: Uint8Array): Buffer {
  return Buffer.concat([toLittleEndian(BigInt(data.length), 8), data]);
}

function passwordScalar(hash: Uint8Array): bigint {
  let scalar = mod(fromLittleEndian(hash), ORDER);
  for (let bit = 1n; bit < COFACTOR; bit <<= 1n) {
    if (scalar & bit) {
      scalar += ORDER * bit;
    }
  }
  return scalar;
}

export type SpakeRole = 'alice' | 'bob';

export interface SpakeNames {
  mine: Uint8Array;
  theirs: Uint8Array;
}

/**
 * One side of the SPAKE2 exchange BoringSSL runs over Ed25519, which is the
 * one adb pairs with: both sides hold the same password, swap one message
 * each, and arrive at the same 64-byte key only when the passwords match.
 * `random` is the 64 bytes the private key comes from.
 */
export class Spake2 {
  readonly message: Buffer;
  private readonly privateKey: bigint;
  private readonly scalar: bigint;
  private readonly passwordHash: Buffer;

  constructor(
    private readonly role: SpakeRole,
    private readonly names: SpakeNames,
    password: Uint8Array,
    random: Uint8Array = randomBytes(64),
  ) {
    this.privateKey = mod(fromLittleEndian(random), ORDER) * COFACTOR;
    this.passwordHash = createHash('sha512').update(password).digest();
    this.scalar = passwordScalar(this.passwordHash);
    const mask = multiply(this.scalar, role === 'alice' ? M : N);
    this.message = encode(add(multiply(this.privateKey, BASE), mask));
  }

  /** The key both sides share, from the message the other side sent. */
  key(theirMessage: Uint8Array): Buffer {
    const masked = decode(theirMessage);
    if (!masked) {
      throw new Error('the other side sent a SPAKE2 message that is not a point');
    }
    const mask = multiply(this.scalar, this.role === 'alice' ? N : M);
    const shared = encode(multiply(this.privateKey, add(masked, negate(mask))));

    const alice = this.role === 'alice';
    const transcript = [
      alice ? this.names.mine : this.names.theirs,
      alice ? this.names.theirs : this.names.mine,
      alice ? this.message : theirMessage,
      alice ? theirMessage : this.message,
      shared,
      this.passwordHash,
    ];
    const hash = createHash('sha512');
    for (const part of transcript) {
      hash.update(lengthPrefixed(part));
    }
    return hash.digest();
  }
}
