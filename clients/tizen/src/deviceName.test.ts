// What a Samsung set calls itself, and what it costs when it will not say.
//
// Every one of these APIs is optional: they differ by firmware and by model, and
// `webapis` is absent entirely in a browser, which is where this shell is
// developed. So the case that matters most is the one where nothing answers, and
// the case that matters next is a firmware where a call EXISTS and throws.
//
// The order is the point of the rest. `getTVName` is the name in Settings, the
// one the set already announces to AirPlay and Smart View, and it is the only
// one a person recognises in a list of televisions. The model calls behind it
// are a fallback for firmware without the network API: "The Frame" beats
// "Tizen", and both beat nothing.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTizenDeviceName } from './deviceName';

type BuildListener = (value: unknown) => void;

interface Stub {
  tvName?: unknown;
  realModel?: unknown;
  capability?: unknown;
  build?: unknown;
  /** The bus answers the BUILD query with an error instead of a value. */
  buildFails?: boolean;
  throwOn?: 'tvName' | 'realModel' | 'capability' | 'getPropertyValue';
}

/** Installs a Tizen platform on `globalThis`, as a set's firmware would. */
function platform(stub: Stub) {
  const answer = (key: NonNullable<Stub['throwOn']>, value: unknown) => () => {
    if (stub.throwOn === key) throw new Error('not on this firmware');
    return value;
  };
  Object.assign(globalThis, {
    webapis: {
      network: stub.tvName === undefined ? {} : { getTVName: answer('tvName', stub.tvName) },
      productinfo:
        stub.realModel === undefined ? {} : { getRealModel: answer('realModel', stub.realModel) },
    },
    tizen: {
      systeminfo: {
        getCapability:
          stub.capability === undefined ? undefined : answer('capability', stub.capability),
        getPropertyValue: (
          _property: string,
          onSuccess: BuildListener,
          onError?: BuildListener,
        ) => {
          if (stub.throwOn === 'getPropertyValue') throw new Error('not on this firmware');
          if (stub.buildFails) onError?.(new Error('no such property'));
          else if (stub.build !== undefined) onSuccess(stub.build);
        },
      },
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'webapis');
  Reflect.deleteProperty(globalThis, 'tizen');
});

describe('a set that answers', () => {
  it("takes the owner's own name over any model string", () => {
    platform({
      tvName: 'Salon',
      realModel: 'The Frame',
      capability: 'UE55LS03A',
      build: { model: 'QE65' },
    });
    expect(resolveTizenDeviceName().get()).toBe('Salon');
  });

  it('falls back to the real model where the network API is missing', () => {
    platform({ realModel: 'The Frame', capability: 'UE55LS03A' });
    expect(resolveTizenDeviceName().get()).toBe('The Frame');
  });

  it('falls back again to the capability key', () => {
    platform({ capability: 'UE55LS03A' });
    expect(resolveTizenDeviceName().get()).toBe('UE55LS03A');
  });

  it('trims what the bus hands over', () => {
    platform({ tvName: '  Salon  ' });
    expect(resolveTizenDeviceName().get()).toBe('Salon');
  });

  it.each<[string, unknown]>([
    ['empty', ''],
    ['blank', '   '],
    ['not a string', 42],
    ['null', null],
  ])('treats %s as no answer and moves on', (_label, value) => {
    platform({ tvName: value, realModel: 'The Frame' });
    expect(resolveTizenDeviceName().get()).toBe('The Frame');
  });
});

describe('a set that will not', () => {
  it('answers nothing in a browser, where none of this exists', () => {
    expect(resolveTizenDeviceName().get()).toBeNull();
  });

  it('answers nothing when every source is present and empty', () => {
    platform({});
    expect(resolveTizenDeviceName().get()).toBeNull();
  });

  it.each(['tvName', 'realModel', 'capability'] as const)(
    'moves past a %s that throws rather than taking the shell down with it',
    (throwOn) => {
      platform({ tvName: 'x', realModel: 'y', capability: 'z', throwOn });
      expect(resolveTizenDeviceName().get()).not.toBeNull();
    },
  );
});

describe('BUILD, which arrives late', () => {
  // The only asynchronous source, and the friendliest model string of the three,
  // so it is worth waiting for when nothing synchronous answered.
  it('is asked only when nothing synchronous answered, and lands afterwards', () => {
    platform({ build: { model: 'QE65QN95B' } });
    const source = resolveTizenDeviceName();
    expect(source.get()).toBe('QE65QN95B');
  });

  it('is not asked at all once a name is already in hand', () => {
    const onSuccess = vi.fn();
    platform({ tvName: 'Salon' });
    (globalThis as { tizen?: { systeminfo?: { getPropertyValue?: unknown } } }).tizen = {
      systeminfo: { getPropertyValue: onSuccess },
    };
    expect(resolveTizenDeviceName().get()).toBe('Salon');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('ignores a payload that is not the documented shape', () => {
    platform({ build: { notModel: 'QE65' } });
    expect(resolveTizenDeviceName().get()).toBeNull();
  });

  it('survives a firmware where getPropertyValue itself throws', () => {
    platform({ throwOn: 'getPropertyValue' });
    expect(resolveTizenDeviceName().get()).toBeNull();
  });

  // The bus reports a missing property through its error callback rather than by
  // throwing, so that path has to be a no-op and not an unhandled rejection.
  it('takes an error from the bus as no answer', () => {
    platform({ buildFails: true });
    expect(resolveTizenDeviceName().get()).toBeNull();
  });
});
