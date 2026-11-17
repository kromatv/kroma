import { compareRaw, floorOf } from '@kromatv/registry';

/** The engines `kroma build` reads off the build instead of the author: `host`,
 *  the interface the component imports, and `core`, the oldest core schema its
 *  `storage.core` grant runs on. `null` when the module has none to record. */
export interface Recorded {
  host: string | null;
  core: string | null;
}

/**
 * The first server release that checks each recorded engine. A server before it
 * refuses an engine it cannot name, so a bundle carries one only when the
 * module's own server floor is at or past it, and no such server could run the
 * module anyway.
 */
export const ENGINE_FLOORS: Readonly<Record<keyof Recorded, string>> = {
  host: '0.1.40',
  core: '0.1.40',
};

const ENGINES = ['host', 'core'] as const;

/**
 * The manifest a bundle carries, from the one its author wrote: each recorded
 * engine joins `engines` once the module's server floor reaches its
 * {@link ENGINE_FLOORS} entry. A manifest that gains none is returned byte for
 * byte, so a bundle only moves when its module does.
 */
export function bundledManifest(authored: string, recorded: Recorded): string {
  const manifest: { engines?: Record<string, string> | null } = JSON.parse(authored);
  const range = manifest.engines?.server;
  const floor = range ? floorOf(range) : null;
  const gained = ENGINES.flatMap((engine) => {
    const value = recorded[engine];
    const checked = floor !== null && compareRaw(floor, ENGINE_FLOORS[engine]) >= 0;
    return value && checked ? [[engine, value] as const] : [];
  });
  if (gained.length === 0) {
    return authored;
  }
  const engines = { ...manifest.engines, ...Object.fromEntries(gained) };
  return `${JSON.stringify({ ...manifest, engines }, null, 2)}\n`;
}
