import { describe, expect, it, vi } from 'vitest';
import { duidAt, duidOf } from './duid';
import { reach } from './reach';

vi.mock('./reach', () => ({ reach: vi.fn() }));

describe('duidOf', () => {
  it('asks the set for its DUID and trims what it printed', async () => {
    const shell = vi.fn(async () => '1900A2C4D6E8\r\n');

    expect(await duidOf({ shell })).toBe('1900A2C4D6E8');
    expect(shell.mock.calls[0]).toEqual(['0 getduid', { limit: 256, timeoutMs: 20_000 }]);
  });

  it('answers nothing when the set printed nothing', async () => {
    expect(await duidOf({ shell: async () => '\r\n' })).toBeNull();
  });

  it('answers nothing when the set closed the shell', async () => {
    const shell = async () => {
      throw new Error('closed');
    };

    expect(await duidOf({ shell })).toBeNull();
  });
});

describe('duidAt', () => {
  it('reads the DUID of the set at an address, then lets go of it', async () => {
    const close = vi.fn();
    vi.mocked(reach).mockResolvedValue({ shell: async () => '1900A2C4D6E8\r\n', close } as never);

    expect(await duidAt('192.168.1.31')).toBe('1900A2C4D6E8');
    expect(reach).toHaveBeenCalledWith('192.168.1.31');
    expect(close).toHaveBeenCalledOnce();
  });

  it('lets go of a set whose shell failed', async () => {
    const close = vi.fn();
    const shell = async () => {
      throw new Error('closed');
    };
    vi.mocked(reach).mockResolvedValue({ shell, close } as never);

    expect(await duidAt('192.168.1.31')).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
