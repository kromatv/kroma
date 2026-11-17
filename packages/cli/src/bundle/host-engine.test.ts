import { describe, expect, it } from 'vitest';
import { interfaceOf } from './host-engine';

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));

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
