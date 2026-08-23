import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { webosAppId } from './app-id';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
vi.mock('../../root', () => ({ root: '/kroma' }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('webosAppId', () => {
  it('reads the id the shell declares in its own appinfo', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ id: 'tv.kroma.webos', version: '1' }));

    expect(webosAppId()).toBe('tv.kroma.webos');
    expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(
      '/kroma/clients/webos/public/appinfo.json',
      'utf8',
    );
  });

  it('falls back to the shipped id when the appinfo is not in this checkout', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(webosAppId()).toBe('tv.kroma.webos');
  });

  it('falls back to the shipped id when the appinfo carries no id', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: '1' }));

    expect(webosAppId()).toBe('tv.kroma.webos');
  });
});
