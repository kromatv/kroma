import type { StoreModule } from '@kromatv/client/modules';
import { describe, expect, it } from 'vitest';
import { readableRange, refusalText } from '#web/features/admin/module-refusal';

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as Parameters<typeof refusalText>[1];

const entry = (over: Partial<StoreModule>): StoreModule => ({
  id: 'tv.kroma.acquisition' as StoreModule['id'],
  name: 'Acquisition',
  version: '0.4.1',
  description: '',
  library: false,
  engines: {},
  dependencies: {},
  optionalDependencies: {},
  contributes: [],
  consumes: [],
  updateAvailable: false,
  updateBlocked: false,
  compatible: false,
  source: 'Official',
  ...over,
});

const engine = {
  kind: 'engine',
  engine: 'server',
  range: '>=0.1.40',
  serverVersion: '0.1.39',
} as const;

describe('refusalText', () => {
  it('says nothing for an entry this server can take', () => {
    expect(refusalText(entry({ compatible: true }), t)).toBeNull();
  });

  it('names the range and the running version for an engine refusal', () => {
    expect(refusalText(entry({ refusal: engine }), t)).toBe(
      'admin.modulesRefusalEngine {"range":"≥ 0.1.40","serverVersion":"0.1.39"}',
    );
  });

  it('pins the requirement on the update when an older version is installed', () => {
    const blocked = entry({ installedVersion: '0.3.13', updateBlocked: true, refusal: engine });

    expect(refusalText(blocked, t)).toBe(
      'admin.modulesRefusalUpdate {"range":"≥ 0.1.40","serverVersion":"0.1.39","version":"0.4.1"}',
    );
  });

  it('reads a bare version as a floor', () => {
    const bare = entry({ refusal: { ...engine, range: '0.1.40' } });

    expect(refusalText(bare, t)).toContain('"range":"≥ 0.1.40"');
  });

  it('words the schema, platform and unknown-engine refusals', () => {
    expect(refusalText(entry({ refusal: { kind: 'schema', built: 1, speaks: 2 } }), t)).toBe(
      'admin.modulesRefusalSchema',
    );
    expect(refusalText(entry({ refusal: { kind: 'platform', target: 'x' } }), t)).toBe(
      'admin.modulesRefusalPlatform',
    );
    expect(refusalText(entry({ refusal: { kind: 'unknownEngine', engine: 'ffmpeg' } }), t)).toBe(
      'admin.modulesRefusalUnknownEngine {"engine":"ffmpeg"}',
    );
  });

  it('tells a module made for a newer KROMA from one that needs rebuilding', () => {
    const newer = entry({ refusal: { kind: 'schema', built: 3, speaks: 2 } });

    expect(refusalText(newer, t)).toBe('admin.modulesRefusalSchemaNewer');
  });

  it('names an engine other than the server', () => {
    const other = entry({ refusal: { ...engine, engine: 'ffmpeg', range: '>=6.0.0' } });

    expect(refusalText(other, t)).toBe(
      'admin.modulesRefusalEngineOther {"engine":"ffmpeg","range":"≥ 6.0.0"}',
    );
  });

  it('names the blocked version for every kind of refusal', () => {
    const blocked = (refusal: StoreModule['refusal']) =>
      entry({ installedVersion: '0.3.13', updateBlocked: true, refusal });

    expect(refusalText(blocked({ kind: 'platform', target: 'x' }), t)).toBe(
      'admin.modulesRefusalUpdatePlatform {"version":"0.4.1"}',
    );
    expect(refusalText(blocked({ kind: 'schema', built: 1, speaks: 2 }), t)).toBe(
      'admin.modulesRefusalUpdateSchema {"version":"0.4.1"}',
    );
    expect(refusalText(blocked({ kind: 'schema', built: 3, speaks: 2 }), t)).toBe(
      'admin.modulesRefusalUpdateSchemaNewer {"version":"0.4.1"}',
    );
    expect(refusalText(blocked({ kind: 'unknownEngine', engine: 'ffmpeg' }), t)).toBe(
      'admin.modulesRefusalUpdateUnknownEngine {"engine":"ffmpeg","version":"0.4.1"}',
    );
  });

  it('says nothing about a catalog version older than the installed one', () => {
    const behind = entry({ installedVersion: '0.5.0', refusal: engine });

    expect(refusalText(behind, t)).toBeNull();
  });

  it('falls back to the reason from a server that sends no refusal', () => {
    expect(refusalText(entry({ reason: 'requires server >=9' }), t)).toBe('requires server >=9');
  });
});

describe('readableRange', () => {
  it.each([
    ['0.1.40', '≥ 0.1.40'],
    [' 0.1.40-canary.3 ', '≥ 0.1.40-canary.3'],
    ['0.1.40+build.7', '≥ 0.1.40+build.7'],
    ['>= 0.1.40', '≥ 0.1.40'],
    ['>=0.1.40 <= 0.2.0', '≥ 0.1.40 ≤ 0.2.0'],
    ['^0.3.0', '^0.3.0'],
  ])('reads %j as %j', (range, readable) => {
    expect(readableRange(range)).toBe(readable);
  });
});
