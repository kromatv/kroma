const MENTIONED = /kroma:module\/[a-z][a-z0-9-]*@\d+\.\d+\.\d+/g;
const NAME = /^kroma:module\/[a-z][a-z0-9-]*@(\d+\.\d+\.\d+)$/;

/**
 * The version of the `kroma:module` interface a component imports, read from
 * the import names in its bytes. Each name is read whole through the length
 * that precedes it, since the byte after a name can be a digit. `null` when it
 * imports none of it. A component that names two versions is refused: no
 * server could link it.
 */
export function interfaceOf(wasm: Uint8Array): string | null {
  const names = Buffer.from(wasm.buffer, wasm.byteOffset, wasm.byteLength).toString('latin1');
  const versions = new Set<string>();
  for (const found of names.matchAll(MENTIONED)) {
    const version = versionNamedAt(names, found.index);
    if (version) {
      versions.add(version);
    }
  }
  if (versions.size > 1) {
    throw new Error(`the component imports kroma:module at ${[...versions].join(' and ')}`);
  }
  return [...versions][0] ?? null;
}

function versionNamedAt(names: string, at: number): string | null {
  const length = names.charCodeAt(at - 1);
  return NAME.exec(names.slice(at, at + length))?.[1] ?? null;
}
