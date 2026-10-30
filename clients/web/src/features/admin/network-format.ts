import type { Flow } from '@kromatv/client/network';
import type { Format } from '@kromatv/ui';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const NOTHING = '-';

/** A connection's duration at the scale it was lived: milliseconds under a
 * second, tenths of a second under a minute, then minutes and seconds. */
export function flowDuration(ms: number, fmt: Pick<Format, 'decimal'>): string {
  if (ms < SECOND_MS) return `${Math.round(ms)} ms`;
  if (ms < MINUTE_MS) return `${fmt.decimal(ms / SECOND_MS, 1)} s`;
  const totalSeconds = Math.round(ms / SECOND_MS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

/** Received then sent, or a dash when the connection carried nothing. */
export function flowVolume(
  flow: Pick<Flow, 'bytesIn' | 'bytesOut'>,
  fmt: Pick<Format, 'bytes'>,
): string {
  if (flow.bytesIn === 0 && flow.bytesOut === 0) return NOTHING;
  return `${fmt.bytes(flow.bytesIn)} / ${fmt.bytes(flow.bytesOut)}`;
}

/** `host:port`, with an IPv6 address bracketed as in a URL. */
export function destination(host: string, port: number): string {
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}
