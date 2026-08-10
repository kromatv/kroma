// The reference counting, which is the whole reason this file is more than a
// pass-through to the native module.
//
// The native side holds ONE browser and ONE published record, and a phone has
// more than one caller: the cast picker browses for the whole signed-in session
// while the pairing screen browses whenever it is open. Every failure this
// guards against is silent - a browse cancelled by whichever caller closed
// first, a published record taken down by the owner it already replaced, a
// stopped browse still reporting from a worker parked in a resolve - so none of
// it shows up as an error, only as a television that is never listed.

import type { LanDiscoveryBridge, LanService } from '@kroma/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FoundEvent = { services: LanService[]; epoch: number };

const env = vi.hoisted(() => ({
  os: 'ios' as 'ios' | 'android',
  version: 17 as number,
  permission: 'granted' as string,
  permissionThrows: false,
  hasNative: true,
}));

const native = vi.hoisted(() => ({
  published: [] as { name: string; txt: Record<string, string> }[],
  unpublished: 0,
  started: [] as number[],
  stopped: 0,
  removed: 0,
  emit: null as ((event: FoundEvent) => void) | null,
}));

vi.mock('expo', () => ({
  requireOptionalNativeModule: () =>
    env.hasNative
      ? {
          publish: (name: string, txt: Record<string, string>) =>
            native.published.push({ name, txt }),
          unpublish: () => {
            native.unpublished += 1;
          },
          startBrowse: (epoch: number) => native.started.push(epoch),
          stopBrowse: () => {
            native.stopped += 1;
          },
          addListener: (_topic: string, handler: (event: FoundEvent) => void) => {
            native.emit = handler;
            return {
              remove: () => {
                native.removed += 1;
                native.emit = null;
              },
            };
          },
        }
      : null,
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return env.os;
    },
    get Version() {
      return env.version;
    },
  },
  PermissionsAndroid: {
    request: async () => {
      if (env.permissionThrows) throw new Error('no such permission');
      return env.permission;
    },
    RESULTS: { GRANTED: 'granted' },
  },
}));

/** A fresh module, since `lanBeacon` is built once at import time. */
async function load(): Promise<LanDiscoveryBridge | null> {
  vi.resetModules();
  const mod = await import('./index');
  return mod.lanBeacon;
}

/** Lets the permission promise settle before asserting on what followed it. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const SERVICE: LanService = { name: 'Salon', txt: { handle: 'h-salon' } };

beforeEach(() => {
  env.os = 'ios';
  env.version = 17;
  env.permission = 'granted';
  env.permissionThrows = false;
  env.hasNative = true;
  native.published = [];
  native.unpublished = 0;
  native.started = [];
  native.stopped = 0;
  native.removed = 0;
  native.emit = null;
});

describe('a build without the native half', () => {
  it('is null, and null IS the capability check', async () => {
    env.hasNative = false;
    expect(await load()).toBeNull();
  });
});

describe('publishing a record', () => {
  it('hands the name and text record to the native side', async () => {
    const lan = await load();
    lan?.publish?.(SERVICE);
    await settled();
    expect(native.published).toEqual([{ name: 'Salon', txt: { handle: 'h-salon' } }]);
  });

  it('takes it down again on release', async () => {
    const lan = await load();
    const stop = lan?.publish?.(SERVICE);
    await settled();
    stop?.();
    expect(native.unpublished).toBe(1);
  });

  // A device is in one state, so the record is a single slot: releasing one that
  // has already been replaced must not take down its replacement.
  it('will not let a replaced owner take down the record that replaced it', async () => {
    const lan = await load();
    const stopFirst = lan?.publish?.(SERVICE);
    lan?.publish?.({ name: 'Chambre', txt: {} });
    await settled();

    stopFirst?.();
    expect(native.unpublished).toBe(0);
  });

  it('does not publish a record that was released before the permission came back', async () => {
    const lan = await load();
    const stop = lan?.publish?.(SERVICE);
    stop?.();
    await settled();
    expect(native.published).toEqual([]);
  });
});

describe('browsing, with more than one caller', () => {
  it('starts the native browser for the first caller only', async () => {
    const lan = await load();
    lan?.browse?.(() => undefined);
    await settled();
    lan?.browse?.(() => undefined);
    await settled();
    expect(native.started).toHaveLength(1);
  });

  // Whichever caller closed first would otherwise cancel the other's browse, and
  // the survivor would never learn, never restart, and report nothing for the
  // rest of the session.
  it('stops it only when the LAST caller goes', async () => {
    const lan = await load();
    const first = lan?.browse?.(() => undefined);
    const second = lan?.browse?.(() => undefined);
    await settled();

    first?.();
    expect(native.stopped).toBe(0);
    second?.();
    expect(native.stopped).toBe(1);
    expect(native.removed).toBe(1);
  });

  it('is not fooled by a caller that releases twice', async () => {
    const lan = await load();
    const first = lan?.browse?.(() => undefined);
    lan?.browse?.(() => undefined);
    await settled();

    first?.();
    first?.();
    expect(native.stopped).toBe(0);
  });

  it('hands every caller the whole current view', async () => {
    const lan = await load();
    const a: LanService[][] = [];
    const b: LanService[][] = [];
    lan?.browse?.((s) => a.push(s));
    await settled();
    native.emit?.({ services: [SERVICE], epoch: native.started[0] ?? 1 });

    // A caller arriving mid-session is not left blank until the link changes.
    lan?.browse?.((s) => b.push(s));
    expect(b[0]).toEqual([SERVICE]);
    expect(a[0]).toEqual([SERVICE]);
  });

  // A browse that has been told to stop can still report (a worker parked in a
  // resolve, a listener torn down mid-flight) and the channel is shared.
  it('ignores a report from a browse it is no longer running', async () => {
    const lan = await load();
    const seen: LanService[][] = [];
    lan?.browse?.((s) => seen.push(s));
    await settled();
    const mine = native.started[0] ?? 1;

    native.emit?.({ services: [SERVICE], epoch: mine + 99 });
    expect(seen).toHaveLength(0);

    native.emit?.({ services: [SERVICE], epoch: mine });
    expect(seen).toHaveLength(1);
  });

  it('forgets the last view once everyone has gone', async () => {
    const lan = await load();
    const stop = lan?.browse?.(() => undefined);
    await settled();
    native.emit?.({ services: [SERVICE], epoch: native.started[0] ?? 1 });
    stop?.();

    const seen: LanService[][] = [];
    lan?.browse?.((s) => seen.push(s));
    lan?.browse?.((s) => seen.push(s));
    // The second caller is handed the view, and it is empty rather than stale.
    expect(seen[0]).toEqual([]);
  });
});

describe('Android 13, where discovery moved behind a runtime permission', () => {
  it('asks, and browses once it is granted', async () => {
    env.os = 'android';
    env.version = 33;
    const lan = await load();
    lan?.browse?.(() => undefined);
    await settled();
    expect(native.started).toHaveLength(1);
  });

  // A refusal simply leaves the server path doing the work it was already doing.
  it('does not browse or publish when it is refused', async () => {
    env.os = 'android';
    env.version = 33;
    env.permission = 'denied';
    const lan = await load();
    lan?.browse?.(() => undefined);
    lan?.publish?.(SERVICE);
    await settled();
    expect(native.started).toEqual([]);
    expect(native.published).toEqual([]);
  });

  it('treats a throwing permission request as a refusal', async () => {
    env.os = 'android';
    env.version = 33;
    env.permissionThrows = true;
    const lan = await load();
    lan?.browse?.(() => undefined);
    await settled();
    expect(native.started).toEqual([]);
  });

  it('asks for nothing on an older Android, where the manifest entry is enough', async () => {
    env.os = 'android';
    env.version = 31;
    const lan = await load();
    lan?.browse?.(() => undefined);
    await settled();
    expect(native.started).toHaveLength(1);
  });
});
