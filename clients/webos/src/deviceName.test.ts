// What an LG set calls itself, asked of the Luna bus.
//
// The reply crosses a process boundary, so nothing about its shape is known
// until it is parsed, and the bus has answered two different shapes across webOS
// versions. What is pinned here is that both are read, that anything else is
// simply no answer rather than a thrown error taking the shell down, and that a
// browser (where neither the bridge nor `webOS` exists) costs nothing at all.
//
// The preferences service is asked FIRST and `webOS.deviceInfo` only when there
// is no bus: the first gives the name the owner set, the second gives the model,
// and a model only beats the word "webOS".

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveWebOsDeviceName } from './deviceName';

const KEY = 'com.webos.service.properties.deviceName';

interface Bridge {
  onservicecallback: ((message: string) => void) | null;
  call(uri: string, payload: string): void;
}

/** A Luna bus that replies with `message` as soon as it is called. */
function bus(message: string | null, opts: { throwOnCall?: boolean } = {}) {
  const calls: { uri: string; payload: string }[] = [];
  class StubBridge implements Bridge {
    onservicecallback: ((message: string) => void) | null = null;
    call(uri: string, payload: string) {
      calls.push({ uri, payload });
      if (opts.throwOnCall) throw new Error('no such service');
      if (message !== null) this.onservicecallback?.(message);
    }
  }
  Object.assign(globalThis, { PalmServiceBridge: StubBridge });
  return calls;
}

function withDeviceInfo(info: unknown) {
  Object.assign(globalThis, { webOS: { deviceInfo: (cb: (i: unknown) => void) => cb(info) } });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'PalmServiceBridge');
  Reflect.deleteProperty(globalThis, 'webOS');
});

describe('the preferences service', () => {
  it('reads the name out of the documented reply', () => {
    bus(JSON.stringify({ returnValue: true, values: [{ [KEY]: 'Salon' }] }));
    expect(resolveWebOsDeviceName().get()).toBe('Salon');
  });

  // Older firmware answers the object flat, without the `values` array.
  it('reads the flat shape the bus also answers with', () => {
    bus(JSON.stringify({ [KEY]: 'Chambre' }));
    expect(resolveWebOsDeviceName().get()).toBe('Chambre');
  });

  it('walks past rows that are not the one it asked for', () => {
    bus(JSON.stringify({ values: [{ other: 'x' }, { [KEY]: 'Cuisine' }] }));
    expect(resolveWebOsDeviceName().get()).toBe('Cuisine');
  });

  it('asks for exactly one key, as an array, which is what the service documents', () => {
    const calls = bus(JSON.stringify({ values: [{ [KEY]: 'Salon' }] }));
    resolveWebOsDeviceName();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.uri).toContain('com.webos.service.preferences');
    expect(JSON.parse(calls[0]?.payload ?? '[]')).toEqual([{ key: KEY }]);
  });
});

describe('a bus with nothing to say', () => {
  it.each([
    ['not JSON at all', 'not json'],
    ['JSON of the wrong shape', JSON.stringify({ values: [{ other: 'x' }] })],
    ['a reply with no rows', JSON.stringify({ values: [] })],
    ['a number where an object was expected', JSON.stringify(42)],
  ])('answers nothing for %s, without throwing', (_label, message) => {
    bus(message);
    expect(resolveWebOsDeviceName().get()).toBeNull();
  });

  // Read before the JSON is: a reply far longer than any answer to a one-key
  // query is not an answer, and parsing it first is the expensive way to learn so.
  it('refuses a reply longer than any answer to a one-key query', () => {
    bus(JSON.stringify({ values: [{ [KEY]: 'x'.repeat(9000) }] }));
    expect(resolveWebOsDeviceName().get()).toBeNull();
  });

  it('survives a bridge whose call throws', () => {
    bus(null, { throwOnCall: true });
    expect(resolveWebOsDeviceName().get()).toBeNull();
  });

  it('waits rather than answering, when the bus simply never replies', () => {
    bus(null);
    expect(resolveWebOsDeviceName().get()).toBeNull();
  });
});

describe('without a bus at all', () => {
  it('falls back to the model, which still beats the word "webOS"', () => {
    withDeviceInfo({ modelName: 'OLED55C1' });
    expect(resolveWebOsDeviceName().get()).toBe('OLED55C1');
  });

  it('ignores device info of the wrong shape', () => {
    withDeviceInfo({ notModelName: 'OLED55C1' });
    expect(resolveWebOsDeviceName().get()).toBeNull();
  });

  it('costs nothing in a browser, where none of this exists', () => {
    expect(resolveWebOsDeviceName().get()).toBeNull();
  });

  // The model is the second choice, so it must not be asked for when the bus
  // answered: it would overwrite a real name with a model number.
  it('is not consulted when the preferences service answered', () => {
    const deviceInfo = vi.fn();
    bus(JSON.stringify({ values: [{ [KEY]: 'Salon' }] }));
    Object.assign(globalThis, { webOS: { deviceInfo } });
    expect(resolveWebOsDeviceName().get()).toBe('Salon');
    expect(deviceInfo).not.toHaveBeenCalled();
  });
});
