import { describe, expect, it } from 'vitest';
import { bundledManifest, HOST_ENGINE_FLOOR, interfaceOf } from './host-engine';

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));

const authored = (server: string | null) =>
  JSON.stringify({
    schemaVersion: 3,
    id: 'tv.kroma.notes',
    name: 'Notes',
    version: '1.2.0',
    ...(server ? { engines: { server } } : {}),
  });

describe('interfaceOf', () => {
  it('reads the interface version out of the import names in a component', () => {
    const wasm = bytes('\0asm\x0d\0\x01\0kroma:module/net@0.2.0\x05\0kroma:module/host-api@0.2.0');

    expect(interfaceOf(wasm)).toBe('0.2.0');
  });

  it('is null for a component that imports none of the host interface', () => {
    expect(interfaceOf(bytes('\0asm wasi:io/streams@0.2.6 kroma:modules/net@9.0.0'))).toBeNull();
  });

  it('refuses a component that names two versions of the interface', () => {
    const wasm = bytes('kroma:module/net@0.2.0 kroma:module/sql@0.3.0');

    expect(() => interfaceOf(wasm)).toThrow('0.2.0 and 0.3.0');
  });
});

describe('bundledManifest', () => {
  it('records the interface for a module no older server could run', () => {
    const bundled = JSON.parse(bundledManifest(authored(`>=${HOST_ENGINE_FLOOR}`), '0.2.0'));

    expect(bundled.engines).toEqual({ server: `>=${HOST_ENGINE_FLOOR}`, host: '0.2.0' });
    expect(bundled.id).toBe('tv.kroma.notes');
  });

  it('leaves a module an older server may run byte for byte, since that server refuses the field', () => {
    const older = authored('>=0.1.39');

    expect(bundledManifest(older, '0.2.0')).toBe(older);
  });

  it('leaves a module that sets no server floor as it was written', () => {
    expect(bundledManifest(authored(null), '0.2.0')).toBe(authored(null));
    expect(bundledManifest(authored('*'), '0.2.0')).toBe(authored('*'));
  });

  it('leaves a library, which has no component and so no interface, as it was written', () => {
    const library = authored(`>=${HOST_ENGINE_FLOOR}`);

    expect(bundledManifest(library, null)).toBe(library);
  });
});
