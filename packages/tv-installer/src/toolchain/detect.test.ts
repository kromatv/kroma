import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { locate, requireTool, type Tool } from './detect';

vi.mock('node:fs', () => ({ existsSync: vi.fn() }));

const which = vi.fn<(binary: string) => string | null>();

vi.stubGlobal('Bun', { which });

const adb: Tool = {
  id: 'adb',
  label: 'Android Debug Bridge',
  binary: 'adb',
  source: 'dl.google.com platform-tools',
  candidates: () => ['/opt/android/platform-tools/adb', '/usr/local/bin/adb'],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('locate', () => {
  it('takes the binary PATH already answers with', () => {
    which.mockReturnValue('/usr/bin/adb');

    expect(locate(adb)).toBe('/usr/bin/adb');
    expect(vi.mocked(existsSync)).not.toHaveBeenCalled();
  });

  it('falls back to the first place the tool is known to install itself', () => {
    which.mockReturnValue(null);
    vi.mocked(existsSync).mockImplementation((path) => path === '/usr/local/bin/adb');

    expect(locate(adb)).toBe('/usr/local/bin/adb');
  });

  it('answers nothing when neither PATH nor any known place holds it', () => {
    which.mockReturnValue(null);
    vi.mocked(existsSync).mockReturnValue(false);

    expect(locate(adb)).toBeNull();
  });

  it('answers nothing for a tool that names no place to look', () => {
    which.mockReturnValue(null);

    expect(locate({ ...adb, candidates: undefined })).toBeNull();
  });
});

describe('requireTool', () => {
  it('answers the path when the tool is here', () => {
    which.mockReturnValue('/usr/bin/adb');

    expect(requireTool(adb)).toBe('/usr/bin/adb');
  });

  it('says where a missing tool comes from', () => {
    which.mockReturnValue(null);
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => requireTool(adb)).toThrow(
      'Android Debug Bridge is missing: install it from dl.google.com platform-tools',
    );
  });
});
