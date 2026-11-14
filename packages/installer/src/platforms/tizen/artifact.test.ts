import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankArtifacts, resolveArtifact } from '../../install/artifact';
import { buildable, TV_NATIVE } from '../../install/build';
import { matchingPaths } from '../../install/matching-paths';
import { root } from '../../shared/root';
import { runOk } from '../../shared/run';
import type { Television } from '../../shared/television';
import {
  resolveTizenArtifact,
  TIZEN_NATIVE_PACKAGE,
  TIZEN_SHELL,
  TIZEN_WEB_PACKAGE,
  tizenSources,
} from './artifact';

vi.mock('../../install/artifact', async (original) => ({
  ...(await original<typeof import('../../install/artifact')>()),
  resolveArtifact: vi.fn(),
}));
vi.mock('../../shared/run', () => ({ runOk: vi.fn() }));
vi.mock('../../install/matching-paths', () => ({ matchingPaths: vi.fn(() => []) }));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  statSync: () => ({ mtimeMs: 1_000 }),
}));

const tizenOut = '/kroma/clients/tizen/out';
const nativeTpk = join(root, TV_NATIVE, 'tizen/bin/Release/tizen80/tv.kroma.app-0.1.40.tpk');

const salon: Television = {
  host: '192.168.1.31',
  platform: 'tizen',
  vendor: 'Samsung',
  name: 'Salon',
  model: 'UE50AU7172',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
};

const dated = (version: string): Television => ({
  ...salon,
  runtime: { name: 'Tizen', version, engine: null, learned: 'derived' },
});

const resolvedWith = () => vi.mocked(resolveArtifact).mock.calls[0]?.[0];

const builtNative = () =>
  vi
    .mocked(matchingPaths)
    .mockImplementation((_root, pattern) =>
      pattern === TIZEN_NATIVE_PACKAGE.globs[0] ? [nativeTpk] : [],
    );

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(matchingPaths).mockImplementation(() => []);
});

describe('rankArtifacts', () => {
  it('puts the every-tier Samsung build ahead of the newer per-tier slices', () => {
    const built = [
      { path: `${tizenOut}/KROMA-tizen8-0.1.33.wgt`, mtimeMs: 3_000 },
      { path: `${tizenOut}/KROMA-tizen4to7-0.1.33.wgt`, mtimeMs: 2_000 },
      { path: `${tizenOut}/KROMA-tizen-0.1.33.wgt`, mtimeMs: 1_000 },
    ];

    expect(rankArtifacts(built, TIZEN_WEB_PACKAGE.preferred)).toEqual([
      `${tizenOut}/KROMA-tizen-0.1.33.wgt`,
      `${tizenOut}/KROMA-tizen8-0.1.33.wgt`,
      `${tizenOut}/KROMA-tizen4to7-0.1.33.wgt`,
    ]);
  });
});

describe('buildable', () => {
  it('builds both Samsung apps from this checkout', () => {
    expect(buildable(TV_NATIVE)).toBe(true);
    expect(buildable(TIZEN_SHELL)).toBe(true);
  });
});

describe('tizenSources', () => {
  it('offers both releases and a build from source where nothing is built yet', () => {
    expect(tizenSources()).toEqual(['stable', 'canary', 'build']);
  });

  it('offers the local package when either Samsung app is built here', () => {
    builtNative();

    expect(tizenSources()).toEqual(['local', 'stable', 'canary', 'build']);
  });
});

describe('resolveTizenArtifact', () => {
  it('looks for the native .tpk on a set whose Tizen nothing named', async () => {
    await resolveTizenArtifact({ tv: salon, log: () => {} });

    expect(resolvedWith()).toMatchObject({ id: 'tizen', kind: TIZEN_NATIVE_PACKAGE });
  });

  it('looks for the native .tpk on a set from 2021 or later', async () => {
    await resolveTizenArtifact({ tv: dated('6.0'), log: () => {} });

    expect(resolvedWith()).toMatchObject({ id: 'tizen', kind: TIZEN_NATIVE_PACKAGE });
  });

  it('takes the web .wgt on a set older than Tizen 6.0, and says why', async () => {
    const lines: string[] = [];

    await resolveTizenArtifact({ tv: dated('5.5'), log: (line) => lines.push(line) });

    expect(resolvedWith()).toMatchObject({ id: 'tizen-web', kind: TIZEN_WEB_PACKAGE });
    expect(lines).toEqual([
      'Tizen 5.5 is older than 6.0, the oldest the native app runs on: installing the web app',
    ]);
  });

  it('takes the web .wgt when the install asked for it', async () => {
    await resolveTizenArtifact({ tv: dated('9.0'), options: { web: true }, log: () => {} });

    expect(resolvedWith()).toMatchObject({ id: 'tizen-web', kind: TIZEN_WEB_PACKAGE });
  });

  it('takes the web .wgt built here when no native one is', async () => {
    await resolveTizenArtifact({ tv: salon, source: 'local', log: () => {} });

    expect(resolvedWith()).toMatchObject({ id: 'tizen-web', kind: TIZEN_WEB_PACKAGE });
  });

  it('builds the native app with rn-tv from the TV client', async () => {
    await resolveTizenArtifact({ tv: salon, source: 'build', log: () => {} });
    builtNative();
    const built = await resolvedWith()?.build?.(() => {});

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual(['bunx', 'rn-tv', 'tizen', 'package']);
    expect(vi.mocked(runOk).mock.calls[0]?.[1]?.cwd).toBe(join(root, TV_NATIVE));
    expect(built).toBe(nativeTpk);
  });

  it('fails a native build that left no .tpk behind', async () => {
    await resolveTizenArtifact({ tv: salon, source: 'build', log: () => {} });

    await expect(resolvedWith()?.build?.(() => {})).rejects.toThrow(
      'rn-tv tizen package produced no .tpk',
    );
  });

  it('builds the web bundle from this checkout and leaves it unsigned', async () => {
    await resolveTizenArtifact({
      tv: salon,
      source: 'build',
      options: { web: true },
      log: () => {},
    });
    const built = await resolvedWith()?.build?.(() => {});

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual(['bun', 'run', 'build:tizen']);
    expect(vi.mocked(runOk).mock.calls[0]?.[1]?.cwd).toBe(root);
    expect(built).toBe(join(root, 'clients/tizen/dist'));
  });
});
