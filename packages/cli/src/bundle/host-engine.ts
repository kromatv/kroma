import { compareRaw, floorOf } from '@kromatv/registry';

/**
 * The server release a module must need before its bundle names the interface
 * it was built against. A server older than 0.1.39 refuses any engine it cannot
 * check, `host` included, so only a module that no such server could run anyway
 * carries the field.
 */
export const HOST_ENGINE_FLOOR = '0.1.40';

const IMPORTED = /kroma:module\/[a-z][a-z0-9-]*@(\d+\.\d+\.\d+)/g;

/**
 * The version of the `kroma:module` interface a component imports, read from
 * the import names in its bytes. `null` when it imports none of it. A component
 * that names two versions is refused: no server could link it.
 */
export function interfaceOf(wasm: Uint8Array): string | null {
  const names = Buffer.from(wasm.buffer, wasm.byteOffset, wasm.byteLength).toString('latin1');
  const versions = [...new Set([...names.matchAll(IMPORTED)].map((found) => found[1] ?? ''))];
  if (versions.length > 1) {
    throw new Error(`the component imports kroma:module at ${versions.join(' and ')}`);
  }
  return versions[0] ?? null;
}

/**
 * The manifest a bundle carries, from the one its author wrote. `engines.host`
 * records `host`, the interface the component imports, once the module's server
 * floor is at or past {@link HOST_ENGINE_FLOOR}. Any other manifest is returned
 * byte for byte, so a bundle only moves when its module does.
 */
export function bundledManifest(authored: string, host: string | null): string {
  if (!host) {
    return authored;
  }
  const manifest: { engines?: Record<string, string> | null } = JSON.parse(authored);
  const range = manifest.engines?.server;
  const floor = range ? floorOf(range) : null;
  if (!floor || compareRaw(floor, HOST_ENGINE_FLOOR) < 0) {
    return authored;
  }
  return `${JSON.stringify({ ...manifest, engines: { ...manifest.engines, host } }, null, 2)}\n`;
}
