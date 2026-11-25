import { afterEach, describe, expect, it, vi } from 'vitest';
import { warnInDevelopment } from './dev-warning';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('warnInDevelopment', () => {
  it('tells the developer outside a production build', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnInDevelopment('Un avertissement de développement');

    expect(warn).toHaveBeenCalledWith('Un avertissement de développement');
  });

  it('says nothing in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnInDevelopment('Un avertissement muet');

    expect(warn).not.toHaveBeenCalled();
  });
});
