import { describe, expect, it } from 'vitest';
import { appVersionHeader } from './app-version';

describe('appVersionHeader', () => {
  it('names the shell and the version', () => {
    expect(appVersionHeader({ shell: 'webos', version: '0.1.39' })).toBe('webos/0.1.39');
  });

  it('spells a platform label the way the server reads a shell', () => {
    expect(appVersionHeader({ shell: 'Apple TV', version: '0.1.39-canary.4' })).toBe(
      'apple-tv/0.1.39-canary.4',
    );
  });

  it('sends nothing when the build cannot name itself', () => {
    expect(appVersionHeader({ shell: '', version: '0.1.39' })).toBeUndefined();
    expect(appVersionHeader({ shell: 'web', version: '' })).toBeUndefined();
  });
});
