import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locateAppleTvTool, missingAppleTvTools, requireAppleTvTool } from './toolchain';

const { present, spawnSync, which } = vi.hoisted(() => ({
  present: new Set<string>(),
  spawnSync: vi.fn((_command: readonly string[], _options?: unknown) => ({
    exitCode: 0,
    stdout: Buffer.from(''),
  })),
  which: vi.fn((_binary: string): string | null => null),
}));
vi.mock('node:fs', () => ({ existsSync: (path: string) => present.has(path) }));
vi.mock('../../root', () => ({ root: '/kroma' }));
vi.stubGlobal('Bun', { spawnSync, which });

const DEVELOPER = '/Applications/Xcode.app/Contents/Developer';
const DEVICECTL = `${DEVELOPER}/usr/bin/devicectl`;
const WORKSPACE = '/kroma/clients/tv-native/ios/KROMA.xcworkspace';

const running = process.platform;
const on = (platform: string) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });

const answers = new Map<string, string>();

beforeEach(() => {
  present.clear();
  answers.clear();
  which.mockReset();
  spawnSync.mockReset();
  spawnSync.mockImplementation((command) => {
    const answer = answers.get(command[0] ?? '');
    return answer === undefined
      ? { exitCode: 1, stdout: Buffer.from('') }
      : { exitCode: 0, stdout: Buffer.from(answer) };
  });
  on('darwin');
});

afterEach(() => {
  on(running);
});

describe('locateAppleTvTool', () => {
  it('finds nothing at all on a machine that is not a Mac', () => {
    on('linux');
    answers.set('xcode-select', DEVELOPER);
    present.add(DEVELOPER).add(`${DEVELOPER}/usr/bin`);

    expect(locateAppleTvTool('xcode')).toBeNull();
  });

  it('answers the developer directory xcode-select points at', () => {
    answers.set('xcode-select', DEVELOPER);
    present.add(DEVELOPER).add(`${DEVELOPER}/usr/bin`);

    expect(locateAppleTvTool('xcode')).toBe(DEVELOPER);
  });

  it('refuses a developer directory that carries none of the tools', () => {
    answers.set('xcode-select', DEVELOPER);
    present.add(DEVELOPER);

    expect(locateAppleTvTool('xcode')).toBeNull();
  });

  it('answers nothing when no Xcode has been selected', () => {
    expect(locateAppleTvTool('xcode')).toBeNull();
  });

  it('finds devicectl through xcrun', () => {
    answers.set('xcrun', DEVICECTL);
    present.add(DEVICECTL);

    expect(locateAppleTvTool('devicectl')).toBe(DEVICECTL);
  });

  it('finds CocoaPods on PATH', () => {
    which.mockReturnValue('/opt/homebrew/bin/pod');

    expect(locateAppleTvTool('cocoapods')).toBe('/opt/homebrew/bin/pod');
  });

  it('counts the prebuild as done once the workspace is in the checkout', () => {
    present.add(WORKSPACE);

    expect(locateAppleTvTool('prebuild')).toBe(WORKSPACE);
  });

  it('counts the prebuild as still to run when the workspace is not there', () => {
    expect(locateAppleTvTool('prebuild')).toBeNull();
  });
});

describe('missingAppleTvTools', () => {
  it('asks a build for more than an install needs', () => {
    answers.set('xcode-select', DEVELOPER);
    answers.set('xcrun', DEVICECTL);
    present.add(DEVELOPER).add(`${DEVELOPER}/usr/bin`).add(DEVICECTL);

    expect(missingAppleTvTools('install')).toEqual([]);
    expect(missingAppleTvTools('build')).toEqual(['cocoapods', 'prebuild']);
  });
});

describe('requireAppleTvTool', () => {
  it('answers the path of a tool this Mac has', () => {
    answers.set('xcrun', DEVICECTL);
    present.add(DEVICECTL);

    expect(requireAppleTvTool('devicectl')).toBe(DEVICECTL);
  });

  it('says which Xcode a missing devicectl comes with', () => {
    expect(() => requireAppleTvTool('devicectl')).toThrow(
      'Xcode device tools is missing: the full Xcode: the standalone command line tools do not carry devicectl',
    );
  });
});
