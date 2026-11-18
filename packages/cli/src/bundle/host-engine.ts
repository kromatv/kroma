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
