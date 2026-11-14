import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rankArtifacts, resolveArtifact } from '../../install/artifact';
import { buildable, TV_NATIVE } from '../../install/build';
import { root } from '../../shared/root';
import { runOk } from '../../shared/run';
import type { Television } from '../../shared/television';
import {
  resolveWebosArtifact,
  WEBOS_NATIVE_PACKAGE,
  WEBOS_SHELL,
  WEBOS_WEB_PACKAGE,
  webosSources,
} from './artifact';

const { globbed } = vi.hoisted(() => ({ globbed: new Map<string, string[]>() }));

vi.mock('../../install/artifact', async (original) => ({
  ...(await original<typeof import('../../install/artifact')>()),
  resolveArtifact: vi.fn(),
}));
vi.mock('../../shared/run', () => ({ runOk: vi.fn() }));
vi.mock('../../install/matching-paths', () => ({
  matchingPaths: (base: string, pattern: string) =>
    (globbed.get(pattern) ?? []).map((name) => join(base, name)),
}));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  statSync: () => ({ mtimeMs: 1_000 }),
}));

const webosOut = '/kroma/clients/webos/out';
const NATIVE_GLOB = WEBOS_NATIVE_PACKAGE.globs[0] ?? '';

const chambre: Television = {
  host: '192.168.1.44',
  platform: 'webos',
  vendor: 'LG',
  name: 'Chambre',
  model: 'OLED55C1',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
};

const resolvedWith = () => vi.mocked(resolveArtifact).mock.calls[0]?.[0];

beforeEach(() => {
  globbed.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('rankArtifacts', () => {
  it('sorts a platform that prefers no build newest first', () => {
    const built = [
      { path: `${webosOut}/tv.kroma.webos_0.1.32_all.ipk`, mtimeMs: 1_000 },
      { path: `${webosOut}/tv.kroma.webos_0.1.33_all.ipk`, mtimeMs: 5_000 },
    ];

    expect(rankArtifacts(built, WEBOS_WEB_PACKAGE.preferred)).toEqual([
      `${webosOut}/tv.kroma.webos_0.1.33_all.ipk`,
      `${webosOut}/tv.kroma.webos_0.1.32_all.ipk`,
    ]);
  });
});

describe('buildable', () => {
  it('builds both LG apps from this checkout', () => {
    expect(buildable(TV_NATIVE)).toBe(true);
    expect(buildable(WEBOS_SHELL)).toBe(true);
  });
});

describe('webosSources', () => {
  it('offers both releases and a build from source where nothing is built yet', () => {
    expect(webosSources()).toEqual(['stable', 'canary', 'build']);
  });

  it('offers the local package when the native app is built here', () => {
    globbed.set(NATIVE_GLOB, ['tv.kroma.app_0.1.40_arm.ipk']);

    expect(webosSources()).toEqual(['local', 'stable', 'canary', 'build']);
  });
});

describe('resolveWebosArtifact', () => {
  it('looks for the native .ipk by default', async () => {
    await resolveWebosArtifact({ tv: chambre, log: () => {} });

    expect(resolvedWith()).toMatchObject({ id: 'webos', kind: WEBOS_NATIVE_PACKAGE });
  });

  it('looks for the web .ipk when the install asked for it', async () => {
    await resolveWebosArtifact({ tv: chambre, options: { web: true }, log: () => {} });

    expect(resolvedWith()).toMatchObject({ id: 'webos-web', kind: WEBOS_WEB_PACKAGE });
  });

  it('takes the web .ipk built here when no native one is', async () => {
    await resolveWebosArtifact({ tv: chambre, source: 'local', log: () => {} });

    expect(resolvedWith()).toMatchObject({ id: 'webos-web', kind: WEBOS_WEB_PACKAGE });
  });

  it('builds the native app with rn-tv from the TV client', async () => {
    await resolveWebosArtifact({ tv: chambre, source: 'build', log: () => {} });
    globbed.set(NATIVE_GLOB, ['tv.kroma.app_0.1.40_arm.ipk']);

    const built = await resolvedWith()?.build?.(() => {});

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual(['bunx', 'rn-tv', 'webos', 'package']);
    expect(vi.mocked(runOk).mock.calls[0]?.[1]?.cwd).toBe(join(root, TV_NATIVE));
    expect(built).toBe(join(root, 'tv.kroma.app_0.1.40_arm.ipk'));
  });

  it('fails a native build that left no .ipk behind', async () => {
    await resolveWebosArtifact({ tv: chambre, source: 'build', log: () => {} });

    await expect(resolvedWith()?.build?.(() => {})).rejects.toThrow(
      'rn-tv webos package produced no .ipk',
    );
  });

  it('builds the web bundle, then packs it with the LG packager that bunx fetches', async () => {
    globbed.set('*.ipk', ['tv.kroma.webos_0.1.33_all.ipk']);
    await resolveWebosArtifact({
      tv: chambre,
      source: 'build',
      options: { web: true },
      log: () => {},
    });

    const built = await resolvedWith()?.build?.(() => {});

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual(['bun', 'run', 'build:webos']);
    expect(vi.mocked(runOk).mock.calls[1]?.[0]).toEqual([
      'bunx',
      '--package',
      '@webos-tools/cli',
      'ares-package',
      join(root, 'clients/webos/dist'),
      '--no-minify',
      '-o',
      join(root, 'clients/webos/out'),
    ]);
    expect(built).toBe(join(root, 'clients/webos/out', 'tv.kroma.webos_0.1.33_all.ipk'));
  });

  it('refuses a web packing run that left no package behind', async () => {
    await resolveWebosArtifact({
      tv: chambre,
      source: 'build',
      options: { web: true },
      log: () => {},
    });

    await expect(resolvedWith()?.build?.(() => {})).rejects.toThrow(
      'ares-package produced no .ipk',
    );
  });
});
