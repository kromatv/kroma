import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOk } from '../../run';
import {
  appleTvSources,
  buildAppleTvApp,
  buildableAppleTv,
  localAppleTvApp,
  resolveAppleTvApp,
} from './build';
import { missingAppleTvTools } from './toolchain';

const { mtimes, globbed, present } = vi.hoisted(() => ({
  mtimes: new Map<string, number>(),
  globbed: new Map<string, string[]>(),
  present: new Set<string>(),
}));

vi.mock('node:fs', () => ({
  existsSync: (path: string) => present.has(path),
  statSync: (path: string) => ({ mtimeMs: mtimes.get(path) ?? 0 }),
}));
vi.mock('../../root', () => ({ root: '/kroma' }));
vi.mock('../../run', () => ({ runOk: vi.fn() }));
vi.mock('./toolchain', async (original) => ({
  ...(await original<typeof import('./toolchain')>()),
  missingAppleTvTools: vi.fn(() => []),
}));

class FakeGlob {
  constructor(private readonly pattern: string) {}

  scanSync({ cwd, absolute }: { cwd: string; absolute?: boolean }): string[] {
    const names = globbed.get(this.pattern) ?? [];
    return names.map((name) => (absolute ? `${cwd}/${name}` : name));
  }
}

vi.stubGlobal('Bun', { Glob: FakeGlob });

const BUILT = 'clients/tv-native/ios/build/**/Products/*-appletvos/*.app';
const older = 'clients/tv-native/ios/build/Debug/Products/Debug-appletvos/KROMA.app';
const newer = 'clients/tv-native/ios/build/Release/Products/Release-appletvos/KROMA.app';

const lines: string[] = [];
const log = (line: string) => lines.push(line);

beforeEach(() => {
  globbed.clear();
  mtimes.clear();
  present.clear();
  lines.length = 0;
  vi.mocked(missingAppleTvTools).mockReturnValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('localAppleTvApp', () => {
  it('takes the newest app that was built for a real set', () => {
    globbed.set(BUILT, [older, newer]);
    mtimes.set(`/kroma/${older}`, 1_000);
    mtimes.set(`/kroma/${newer}`, 5_000);

    expect(localAppleTvApp()).toBe(`/kroma/${newer}`);
  });

  it('answers nothing when this checkout has built none', () => {
    expect(localAppleTvApp()).toBeNull();
  });
});

describe('buildableAppleTv', () => {
  it('builds from source when the shell is in this checkout', () => {
    present.add('/kroma/clients/tv-native/package.json');

    expect(buildableAppleTv()).toBe(true);
  });

  it('refuses a checkout the shell is not in', () => {
    expect(buildableAppleTv()).toBe(false);
  });
});

describe('appleTvSources', () => {
  it('offers what was built here and a build from source', () => {
    globbed.set(BUILT, [newer]);
    present.add('/kroma/clients/tv-native/package.json');

    expect(appleTvSources()).toEqual(['local', 'build']);
  });

  it('offers nothing on a machine with neither an app nor the sources', () => {
    expect(appleTvSources()).toEqual([]);
  });
});

describe('resolveAppleTvApp', () => {
  it('takes the app it was given over anything else', async () => {
    const app = await resolveAppleTvApp({ udid: '0000-1111', log, given: '/tmp/KROMA.app' });

    expect(app).toBe('/tmp/KROMA.app');
    expect(vi.mocked(runOk)).not.toHaveBeenCalled();
  });

  it('names the app it found in this checkout, relative to the checkout', async () => {
    globbed.set(BUILT, [newer]);

    const app = await resolveAppleTvApp({ udid: '0000-1111', log });

    expect(app).toBe(`/kroma/${newer}`);
    expect(lines).toEqual([`app: ${newer}`]);
  });

  it('builds against the set even with an app already built here', async () => {
    globbed.set(BUILT, [newer]);
    vi.mocked(runOk).mockResolvedValue('');

    await resolveAppleTvApp({ udid: '0000-1111', log, source: 'build' });

    expect(vi.mocked(runOk)).toHaveBeenCalledOnce();
  });
});

describe('buildAppleTvApp', () => {
  it('builds the app for the set it was given, from the checkout', async () => {
    globbed.set(BUILT, [newer]);
    vi.mocked(runOk).mockResolvedValue('');

    const app = await buildAppleTvApp('0000-1111', log);

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual([
      'bun',
      'run',
      '--filter',
      '@kroma/tv-native',
      'ios',
      '--device',
      '0000-1111',
    ]);
    expect(vi.mocked(runOk).mock.calls[0]?.[1]?.cwd).toBe('/kroma');
    expect(app).toBe(`/kroma/${newer}`);
  });

  it('names every tool a build from source is still missing', async () => {
    vi.mocked(missingAppleTvTools).mockReturnValue(['cocoapods', 'prebuild']);

    await expect(buildAppleTvApp('0000-1111', log)).rejects.toThrow(
      'a build from source still needs CocoaPods (brew install cocoapods), ' +
        "the Expo prebuild (bun run --filter '@kroma/tv-native' prebuild)",
    );
    expect(vi.mocked(runOk)).not.toHaveBeenCalled();
  });

  it('refuses a build that left no app for a real set behind', async () => {
    vi.mocked(runOk).mockResolvedValue('');

    await expect(buildAppleTvApp('0000-1111', log)).rejects.toThrow(
      'the build left no appletvos .app under clients/tv-native/ios/build',
    );
  });
});
