import { describe, expect, it, vi } from 'vitest';
import { searchShell } from './searchShell';

const Shell = () => null;

describe('searchShell', () => {
  it('is absent until a shell registers one, which is what keeps the on-screen keyboard', () => {
    expect(searchShell()).toBeNull();
  });

  it('hands back the registered chrome while it reports itself available', () => {
    const shell = { available: () => true, Shell };
    expect(searchShell(shell)).toBe(shell);
  });

  it('hides a chrome whose probe says no, so a missing native view falls back', () => {
    expect(searchShell({ available: () => false, Shell })).toBeNull();
  });

  it('treats a throwing probe as unavailable rather than taking the screen down', () => {
    const shell = {
      available: () => {
        throw new Error('no native module');
      },
      Shell,
    };
    expect(searchShell(shell)).toBeNull();
  });

  it('asks again on every read: a probe is not cached', () => {
    const available = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const shell = { available, Shell };
    expect(searchShell(shell)).not.toBeNull();
    expect(searchShell(shell)).toBeNull();
    expect(available).toHaveBeenCalledTimes(2);
  });
});
