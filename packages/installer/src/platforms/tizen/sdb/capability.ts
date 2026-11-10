import { z } from 'zod';
import type { SdbConnection } from './connection';

const MAX_PAYLOAD_BYTES = 4095;
const MAX_ENTRIES = 128;
const LENGTH_PREFIX_BYTES = 2;

const Capability = z.record(z.string().min(1).max(64), z.string().max(512));

export type Capability = z.infer<typeof Capability>;

/**
 * The `capability:` payload: a uint16 little-endian byte count, then that many
 * bytes of `key:value` lines. Anything past the declared count is dropped, and
 * a payload without a plausible prefix is read as bare text.
 */
export function parseCapability(payload: Buffer): Capability {
  const entries: [string, string][] = [];
  for (const line of body(payload).split('\n')) {
    const at = line.indexOf(':');
    if (at < 1) continue;
    entries.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    if (entries.length === MAX_ENTRIES) break;
  }
  return Capability.parse(Object.fromEntries(entries));
}

export async function readCapability(connection: SdbConnection): Promise<Capability> {
  const stream = await connection.openStream('capability:');
  const payload = await stream.drain({ limit: MAX_PAYLOAD_BYTES + LENGTH_PREFIX_BYTES });
  stream.close();
  return parseCapability(payload);
}

function body(payload: Buffer): string {
  if (payload.length < LENGTH_PREFIX_BYTES) return '';
  const declared = payload.readUInt16LE(0);
  const framed = declared > 0 && declared <= payload.length - LENGTH_PREFIX_BYTES;
  const bytes = framed
    ? payload.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + declared)
    : payload.subarray(0, MAX_PAYLOAD_BYTES);
  return bytes.toString('utf8');
}
