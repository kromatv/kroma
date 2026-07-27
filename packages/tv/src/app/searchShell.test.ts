import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchShell, setSearchShell } from './searchShell';

const Shell = () => null;

afterEach(() => {
  setSearchShell(null);
});

describe('searchShell', () => {
  it('is absent until a shell registers one, which is what keeps the on-screen keyboard', () => {
    expect(searchShell()).toBeNull();
  });

  it('hands back the registered chrome while it reports itself available', () => {
    const shell = { available: () => true, Shell };
    setSearchShell(shell);
    expect(searchShell()).toBe(shell);
  });

  it('hides a chrome whose probe says no, so a missing native view falls back', () => {
    setSearchShell({ available: () => false, Shell });
    expect(searchShell()).toBeNull();
  });

  it('treats a throwing probe as unavailable rather than taking the screen down', () => {
    setSearchShell({
      available: () => {
        throw new Error('no native module');
      },
      Shell,
    });
    expect(searchShell()).toBeNull();
  });

  it('asks again on every read: a probe is not cached', () => {
    const available = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    setSearchShell({ available, Shell });
    expect(searchShell()).not.toBeNull();
    expect(searchShell()).toBeNull();
    expect(available).toHaveBeenCalledTimes(2);
  });
});
