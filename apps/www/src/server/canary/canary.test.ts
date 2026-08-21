import { describe, expect, it } from 'vitest';
import { artifactFor, isTargetId, LIMIT, readLimit, readRunId, toBuild } from './canary';
import type { Artifact, Run } from './github';

const run = (over: Partial<Run> = {}): Run => ({
  id: 3490258,
  head_sha: 'a'.repeat(40),
  html_url: 'https://github.com/maxscharwath/kroma/actions/runs/3490258',
  updated_at: '2026-08-20T19:14:00Z',
  display_title: 'feat: the thing',
  ...over,
});

const artifact = (name: string, over: Partial<Artifact> = {}): Artifact => ({
  id: 1,
  name,
  size_in_bytes: 1024,
  expired: false,
  expires_at: '2026-11-18T19:14:00Z',
  ...over,
});

// Every artifact a green push to main leaves behind, spelled as CI names them.
const PUSH_ARTIFACTS = [
  artifact('kroma-tizen-wgt'),
  artifact('kroma-webos-ipk'),
  artifact('kroma-androidtv-apk'),
  artifact('kroma-mobile-apk'),
];

describe('readLimit', () => {
  it('falls back to the default for anything that is not a number', () => {
    expect(readLimit(null)).toBe(LIMIT.default);
    expect(readLimit('')).toBe(LIMIT.default);
    expect(readLimit('all')).toBe(LIMIT.default);
  });

  it('clamps to the ceiling that bounds one document to a few calls', () => {
    expect(readLimit('1')).toBe(1);
    expect(readLimit('0')).toBe(1);
    expect(readLimit('-5')).toBe(1);
    expect(readLimit('999')).toBe(LIMIT.max);
  });
});

describe('readRunId', () => {
  it('takes a run id as GitHub numbers them', () => {
    expect(readRunId('3490258')).toBe(3490258);
  });

  it('refuses anything a path segment could otherwise smuggle in', () => {
    expect(readRunId('0')).toBeNull();
    expect(readRunId('-1')).toBeNull();
    expect(readRunId('1e9')).toBeNull();
    expect(readRunId('12.5')).toBeNull();
    expect(readRunId('')).toBeNull();
    expect(readRunId('9'.repeat(20))).toBeNull();
  });
});

describe('isTargetId', () => {
  it('accepts the platforms this channel offers', () => {
    expect(isTargetId('tizen')).toBe(true);
    expect(isTargetId('androidtv')).toBe(true);
  });

  it('refuses a prototype member, which `in` would have accepted', () => {
    expect(isTargetId('constructor')).toBe(false);
    expect(isTargetId('toString')).toBe(false);
    expect(isTargetId('__proto__')).toBe(false);
  });
});

describe('toBuild', () => {
  it('reduces a run to the files it can hand over, in platform order', () => {
    const build = toBuild(run(), PUSH_ARTIFACTS, '0.1.39', 'https://kroma.tv/api/canary');

    expect(build?.version).toBe('0.1.39');
    expect(build?.commit.short).toBe('aaaaaaa');
    expect(build?.files.map((f) => f.target)).toEqual(['android', 'androidtv', 'tizen', 'webos']);
  });

  it('points every file at this origin, so no caller needs a token', () => {
    const build = toBuild(
      run(),
      [artifact('kroma-tizen-wgt')],
      null,
      'https://kroma.tv/api/canary',
    );

    expect(build?.files[0]?.url).toBe('https://kroma.tv/api/canary/dl/3490258/tizen');
  });

  it('drops an artifact no platform here installs', () => {
    const build = toBuild(
      run(),
      [artifact('kroma-tizen-wgt'), artifact('kroma-web-spa'), artifact('sonar-report')],
      null,
      'https://kroma.tv/api/canary',
    );

    expect(build?.files.map((f) => f.target)).toEqual(['tizen']);
  });

  it('answers null for a run that left nothing installable', () => {
    expect(toBuild(run(), [], null, 'https://kroma.tv/api/canary')).toBeNull();
    expect(
      toBuild(run(), [artifact('kroma-web-spa')], null, 'https://kroma.tv/api/canary'),
    ).toBeNull();
  });

  it('carries when GitHub will delete the build, so a stale row can be dropped', () => {
    const build = toBuild(run(), PUSH_ARTIFACTS, null, 'https://kroma.tv/api/canary');

    expect(build?.expiresAt).toBe('2026-11-18T19:14:00Z');
  });
});

describe('artifactFor', () => {
  it('finds the artifact CI uploaded for a platform', () => {
    expect(artifactFor(PUSH_ARTIFACTS, 'webos')?.name).toBe('kroma-webos-ipk');
  });

  it('answers undefined for a run that carries none', () => {
    expect(artifactFor(PUSH_ARTIFACTS, 'macos')).toBeUndefined();
  });
});
