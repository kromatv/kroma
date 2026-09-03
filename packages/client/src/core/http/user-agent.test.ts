import { describe, expect, it } from 'vitest';
import { clientUserAgent } from './user-agent';

describe('clientUserAgent', () => {
  it('names the build, the model and the platform', () => {
    expect(clientUserAgent({ version: '0.1.3', model: 'iPhone 17 Pro', os: 'iOS 26.0' })).toBe(
      'Kroma/0.1.3 (iPhone 17 Pro; iOS 26.0)',
    );
  });

  it('strips what a User-Agent cannot carry', () => {
    expect(clientUserAgent({ version: '1.0', model: 'Télé (salon)', os: 'tvOS 26.0' })).toBe(
      'Kroma/1.0 (Tl salon; tvOS 26.0)',
    );
  });

  it('stays well-formed when a field is missing', () => {
    expect(clientUserAgent({ version: '', model: '', os: '' })).toBe('Kroma/dev (Device; unknown)');
  });
});
