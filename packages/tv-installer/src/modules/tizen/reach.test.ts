import { describe, expect, it, vi } from 'vitest';
import { reach } from './reach';
import { connect } from './sdb';

vi.mock('./sdb', async (original) => ({
  ...(await original<typeof import('./sdb')>()),
  connect: vi.fn(),
}));

describe('reach', () => {
  it('answers the set that opened on its bridge port', async () => {
    const device = { banner: 'sdbd::UE50AU7172' };
    vi.mocked(connect).mockResolvedValue(device as never);

    expect(await reach('192.168.1.31')).toBe(device);
    expect(connect).toHaveBeenCalledWith('192.168.1.31');
  });

  it('says what developer mode needs when nothing answers', async () => {
    vi.mocked(connect).mockRejectedValue(new Error('connect ECONNREFUSED 192.168.1.31:26101'));

    await expect(reach('192.168.1.31')).rejects.toThrow(
      'connect ECONNREFUSED 192.168.1.31:26101. Nothing answered on 26101: developer mode has to be on, naming this computer as the host PC, and the set rebooted since',
    );
  });

  it('quotes a failure that is not an error object', async () => {
    vi.mocked(connect).mockRejectedValue('socket hang up');

    await expect(reach('192.168.1.31')).rejects.toThrow(
      /^socket hang up\. Nothing answered on 26101/,
    );
  });
});
