import { describe, expect, it } from 'vitest';
import { interfaceOf } from './host-engine';

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));
const named = (name: string) => `\0${String.fromCodePoint(name.length)}${name}`;

describe('interfaceOf', () => {
  it('reads the interface version out of the import names in a component', () => {
    const wasm = bytes(
      `\0asm${named('kroma:module/net@0.2.0')}${named('kroma:module/host-api@0.2.0')}`,
    );

    expect(interfaceOf(wasm)).toBe('0.2.0');
  });

  it('is null for a component that imports none of the host interface', () => {
    expect(interfaceOf(bytes('\0asm wasi:io/streams@0.2.6 kroma:modules/net@9.0.0'))).toBeNull();
  });

  it('refuses a component that names two versions of the interface', () => {
    const wasm = bytes(named('kroma:module/net@0.2.0') + named('kroma:module/sql@0.3.0'));

    expect(() => interfaceOf(wasm)).toThrow('0.2.0 and 0.3.0');
  });

  it('reads a version whole when the byte after the name is a digit', () => {
    const wasm = bytes(
      `${named('kroma:module/host-api@0.2.0')}9${named('kroma:module/net@0.2.0')}`,
    );

    expect(interfaceOf(wasm)).toBe('0.2.0');
  });

  it('passes over a mention of the interface that is not an import name', () => {
    const wasm = bytes(`panic: kroma:module/net@0.3.0 failed${named('kroma:module/net@0.2.0')}`);

    expect(interfaceOf(wasm)).toBe('0.2.0');
  });
});
