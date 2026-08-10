// @vitest-environment jsdom
//
// What a television is called, and what it is called when the platform will not
// say. Two halves matter: the fallback - a vendor API that throws, returns
// padding, or is simply absent must leave the caller with the platform label
// rather than an empty row in someone's picker - and the LATE answer, because
// on webOS and Tizen the real name only ever arrives after the first render.

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type DeviceNameSource, lateDeviceName, useDeviceName } from './deviceName';

afterEach(cleanup);

function named(source: DeviceNameSource | undefined, platform = 'webOS'): string {
  return renderHook(() => useDeviceName(source, platform)).result.current;
}

function answering(answer: () => string | null | undefined): DeviceNameSource {
  return { get: answer };
}

describe('a television whose platform will not say', () => {
  it('keeps the platform label', () => {
    expect(named(undefined, 'Tizen')).toBe('Tizen');
  });

  it('is a television when there is not even a label', () => {
    expect(named(undefined, '')).toBe('TV');
  });

  it('treats a source that throws as one with nothing to say', () => {
    const source = answering(() => {
      throw new Error('no such API on this firmware');
    });
    expect(named(source, 'Tizen')).toBe('Tizen');
  });

  it('treats an empty or absent answer as no answer', () => {
    for (const value of ['', '   ', null, undefined]) {
      const source = answering(() => value);
      expect(named(source, 'Tizen'), String(value)).toBe('Tizen');
    }
  });
});

describe('a television that knows its own name', () => {
  it('answers with what the shell said', () => {
    expect(named(answering(() => 'The Frame 75'))).toBe('The Frame 75');
  });

  it('trims what a vendor padded', () => {
    expect(named(answering(() => '  Salon  '))).toBe('Salon');
  });

  it('strips control characters, which a picker would otherwise draw', () => {
    expect(named(answering(() => 'The Frame\n75'))).toBe('The Frame75');
  });

  it('cuts a name to the length the server accepts, and does not leave it padded', () => {
    const name = named(answering(() => `${'x'.repeat(47)}   tail`));
    expect(name).toBe('x'.repeat(47));
    expect(name.length).toBeLessThanOrEqual(48);
  });
});

describe('an answer that lands after the first render', () => {
  it('reaches the caller, rather than leaving it on the platform label', () => {
    const source = lateDeviceName();
    const { result } = renderHook(() => useDeviceName(source, 'webOS'));
    expect(result.current).toBe('webOS');

    act(() => source.found('Salon'));
    expect(result.current).toBe('Salon');
  });

  it('is cleaned the same way a synchronous one is', () => {
    const source = lateDeviceName();
    const { result } = renderHook(() => useDeviceName(source, 'webOS'));

    act(() => source.found('  Salon  '));
    expect(result.current).toBe('Salon');
  });

  it('cannot be erased by a later silence', () => {
    const source = lateDeviceName();
    const { result } = renderHook(() => useDeviceName(source, 'webOS'));

    act(() => source.found('Salon'));
    act(() => source.found(null));
    act(() => source.found('   '));
    expect(result.current).toBe('Salon');
  });

  it('stops reaching a caller that went away', () => {
    const source = lateDeviceName();
    const { unmount } = renderHook(() => useDeviceName(source, 'webOS'));
    unmount();
    expect(() => source.found('Salon')).not.toThrow();
  });
});
