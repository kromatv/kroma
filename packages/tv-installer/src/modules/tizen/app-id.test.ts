import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tizenAppId } from './app-id';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));
vi.mock('../../root', () => ({ root: '/kroma' }));

const config = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<widget xmlns="http://www.w3.org/ns/widgets" id="http://kroma.tv/tizen">',
  '  <tizen:application id="KromaTV001.KROMA" package="KromaTV001" required_version="4.0"/>',
  '</widget>',
].join('\n');

afterEach(() => {
  vi.clearAllMocks();
});

describe('tizenAppId', () => {
  it('reads the id the shell declares in its own config', () => {
    vi.mocked(readFileSync).mockReturnValue(config);

    expect(tizenAppId()).toBe('KromaTV001.KROMA');
    expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(
      '/kroma/clients/tizen/public/config.xml',
      'utf8',
    );
  });

  it('falls back to the shipped id when the config is not in this checkout', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(tizenAppId()).toBe('KromaTV001.KROMA');
  });

  it('falls back to the shipped id when the config declares no application', () => {
    vi.mocked(readFileSync).mockReturnValue('<widget></widget>');

    expect(tizenAppId()).toBe('KromaTV001.KROMA');
  });
});
