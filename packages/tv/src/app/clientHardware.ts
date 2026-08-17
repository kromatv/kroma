// Live hardware of the set this client is running on, for the About screen. The
// Web APIs behind it are ones a TV webview may simply not have, and a native
// (Hermes) shell has none of them at all, so every read answers null rather than
// throwing or guessing, and the About row hides.

/** Null on any value the running engine will not report. `memoryFreeGb` is the
 * RAM still free right now, and only a native shell can answer it: no Web API
 * reports it, so it stays null on every browser shell. */
export interface ClientHardware {
  cpuCores: number | null;
  memoryGb: number | null;
  memoryFreeGb: number | null;
}

/** A native shell's own way to the numbers no Web API gives it, injected at the
 * app root; when one is set it wins over the browser reads. Memory is bytes.
 * Each answers null when the platform withholds the value. */
export interface HardwareSource {
  cpuCores(): number | null;
  memoryBytes(): number | null;
  freeMemoryBytes(): number | null;
}

let source: HardwareSource | null = null;

/** Call once at the app root, before the first render; null removes it. */
export function setHardwareSource(src: HardwareSource | null): void {
  source = src;
}

export function clientHardware(): ClientHardware {
  return {
    cpuCores: readCpuCores(),
    memoryGb: readMemoryGb(),
    memoryFreeGb: readMemoryFreeGb(),
  };
}

interface DeviceNavigator {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

const BYTES_PER_GB = 1024 ** 3;

function readCpuCores(): number | null {
  const injected = fromSource((s) => s.cpuCores());
  if (injected !== null) return injected;
  const nav = globalThis.navigator as DeviceNavigator | undefined;
  return positive(nav?.hardwareConcurrency);
}

function readMemoryGb(): number | null {
  const injected = fromSource((s) => s.memoryBytes());
  if (injected !== null) return Math.round(injected / BYTES_PER_GB) || null;
  // No `performance.memory` fallback: that is the JS heap cap, not the set's
  // RAM, and printing it under "Memory" would be a wrong number rather than none.
  const nav = globalThis.navigator as DeviceNavigator | undefined;
  return positive(nav?.deviceMemory);
}

// Free RAM moves, so it is worth a decimal where the total is not: on a 2 GB
// television the interesting readings are all under one gigabyte.
function readMemoryFreeGb(): number | null {
  const bytes = fromSource((s) => s.freeMemoryBytes());
  return bytes === null ? null : Math.round((bytes / BYTES_PER_GB) * 10) / 10;
}

// A source that is set but throws counts as no answer, so the Web reads below
// still run rather than the row taking the screen down.
function fromSource(read: (s: HardwareSource) => number | null): number | null {
  if (!source) return null;
  try {
    return positive(read(source));
  } catch {
    return null;
  }
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
