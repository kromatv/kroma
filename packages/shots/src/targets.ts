/** How a target is driven: a browser page, the tvOS simulator, or an Android
 * emulator over adb. */
export type TargetKind = 'dom' | 'apple' | 'android';

/** How a target is asked for a particular screen.
 *
 * - `url`: the web client has real routes, so a path is enough.
 * - `dev-nav`: the TV router is an in-memory stack with no address bar, but a
 *   DEV build restores it from `sessionStorage['kroma:dev-nav']` (see
 *   packages/tv/src/app/router.tsx), so seeding that key lands on any screen.
 *   This is why the TV targets drive a dev server rather than a preview build.
 * - `keys`: a native shell has neither, so a screen is reached the way a
 *   viewer reaches it: by pressing remote keys.
 */
export type Routing = 'url' | 'dev-nav' | 'keys';

export interface Target {
  id: string;
  /** Caption used in the published markdown. */
  label: string;
  kind: TargetKind;
  routing: Routing;
  /** dom: the dev server this target expects, and the script that serves it. */
  port?: number;
  serveScript?: string;
  viewport?: { width: number; height: number };
  /** apple: the simulator device name, matched against `simctl list`. */
  device?: string;
  /** android: the AVD name, matched against `emulator -list-avds`. */
  avd?: string;
  /** The bundle/package id to launch, for the native targets. */
  appId?: string;
}

export const TARGETS: readonly Target[] = [
  {
    id: 'web',
    label: 'Web',
    kind: 'dom',
    routing: 'url',
    port: 3000,
    serveScript: 'dev:web',
    viewport: { width: 1440, height: 900 },
  },
  {
    id: 'tizen',
    label: 'Tizen (Samsung)',
    kind: 'dom',
    routing: 'dev-nav',
    port: 5174,
    serveScript: 'dev:tizen',
    viewport: { width: 1920, height: 1080 },
  },
  {
    id: 'webos',
    label: 'webOS (LG)',
    kind: 'dom',
    routing: 'dev-nav',
    port: 5175,
    serveScript: 'dev:webos',
    viewport: { width: 1920, height: 1080 },
  },
  {
    id: 'appletv',
    label: 'Apple TV',
    kind: 'apple',
    routing: 'keys',
    device: 'Apple TV 4K (3rd generation) (at 1080p)',
    appId: 'tv.kroma.mobile',
  },
  {
    id: 'androidtv',
    label: 'Android TV',
    kind: 'android',
    routing: 'keys',
    avd: 'Television_4K',
    appId: 'tv.kroma.mobile',
  },
];

export const DEFAULT_TARGETS = ['web', 'tizen', 'webos'] as const;

export function targetsFrom(list: string): Target[] {
  const wanted = list
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return wanted.map((id) => {
    const target = TARGETS.find((t) => t.id === id);
    if (!target) {
      const known = TARGETS.map((t) => t.id).join(', ');
      throw new Error(`unknown target "${id}"; known targets are ${known}`);
    }
    return target;
  });
}
