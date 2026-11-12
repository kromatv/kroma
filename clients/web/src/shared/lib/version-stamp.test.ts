import type { Health } from '@kromatv/client/media';
import { describe, expect, it } from 'vitest';
import {
  clientStamp,
  sameBuild,
  serverStamp,
  stampLabel,
  stampLines,
  versionReport,
} from './version-stamp';

const health = (patch: Partial<Health> = {}): Health => ({
  status: 'ok',
  version: '0.1.39',
  build: 3488516,
  commit: '1fadb4f',
  ffprobe: true,
  libraries: 1,
  items: 1,
  shows: 0,
  ...patch,
});

const t = (key: string, vars: Record<string, string> = {}) =>
  `${key}${Object.values(vars)
    .map((value) => `[${value}]`)
    .join('')}`;

const client = (patch: Partial<Parameters<typeof clientStamp>[0]> = {}) =>
  clientStamp({ version: '0.1.39', build: 3488516, commit: '1fadb4f', dirty: false, ...patch });

describe('serverStamp', () => {
  it('reads a local server as having no build number', () => {
    expect(serverStamp(health({ build: 0 })).build).toBeNull();
  });

  it('reads a server too old to send a commit, or one that never knew it, as no commit', () => {
    expect(serverStamp(health({ commit: undefined })).commit).toBeNull();
    expect(serverStamp(health({ commit: 'unknown' })).commit).toBeNull();
  });
});

describe('clientStamp', () => {
  it('reads a client built outside a checkout as having no commit', () => {
    expect(client({ commit: 'unknown' }).commit).toBeNull();
  });
});

describe('sameBuild', () => {
  it('matches a server and the web client it serves', () => {
    expect(sameBuild(client(), serverStamp(health()))).toBe(true);
  });

  it('tells two canaries of one version apart by their build number', () => {
    expect(sameBuild(client({ build: 3488517 }), serverStamp(health()))).toBe(false);
  });

  it('tells two versions apart', () => {
    expect(sameBuild(client(), serverStamp(health({ version: '0.1.38' })))).toBe(false);
  });

  it('tells two local builds apart by their commit', () => {
    const local = serverStamp(health({ build: 0 }));

    expect(sameBuild(client({ build: null }), local)).toBe(true);
    expect(sameBuild(client({ build: null, commit: 'abc1234' }), local)).toBe(false);
  });

  it('matches local builds when one side cannot name its commit', () => {
    expect(
      sameBuild(client({ build: null }), serverStamp(health({ build: 0, commit: undefined }))),
    ).toBe(true);
  });
});

describe('stampLabel', () => {
  it('names a CI build by its build number', () => {
    expect(stampLabel(client(), t)).toBe('v0.1.39 · nav.versionBuild[3488516]');
  });

  it('names a local build by its commit', () => {
    expect(stampLabel(client({ build: null }), t)).toBe('v0.1.39 · nav.versionDev[1fadb4f]');
  });

  it('falls back to the bare version when a build can name neither', () => {
    expect(stampLabel(client({ build: null, commit: 'unknown' }), t)).toBe('v0.1.39');
  });
});

describe('stampLines', () => {
  it('shows one line while the server has not answered', () => {
    expect(stampLines(client(), null, t)).toEqual([
      { side: null, text: 'v0.1.39 · nav.versionBuild[3488516]' },
    ]);
  });

  it('shows one line when the server serves its own client', () => {
    expect(stampLines(client(), serverStamp(health()), t)).toHaveLength(1);
  });

  it('shows one line per side when the builds differ', () => {
    const server = serverStamp(health({ version: '0.1.38', build: 3480473 }));

    expect(stampLines(client(), server, t)).toEqual([
      { side: 'nav.versionClient', text: 'v0.1.39 · nav.versionBuild[3488516]' },
      { side: 'nav.versionServer', text: 'v0.1.38 · nav.versionBuild[3480473]' },
    ]);
  });
});

describe('versionReport', () => {
  it('names both builds in the shape the .spk and the Docker image carry', () => {
    expect(versionReport(client({ dirty: true }), serverStamp(health()))).toBe(
      'KROMA client 0.1.39.3488516 (1fadb4f-dirty)\nKROMA server 0.1.39.3488516 (1fadb4f)',
    );
  });

  it('leaves out what a build cannot say', () => {
    expect(versionReport(client({ build: null, commit: 'unknown' }), null)).toBe(
      'KROMA client 0.1.39\nKROMA server unknown',
    );
  });
});
