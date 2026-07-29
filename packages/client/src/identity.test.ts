import { describe, expect, it } from 'vitest';
import { clientUserAgent } from './identity';

// The format the account page parses back. A device that produces a header the
// platform refuses to send goes out with the platform default instead - i.e.
// straight back to "Unknown device" - so the sanitising is the point here.
describe('clientUserAgent', () => {
  it('names the build, the model and the platform', () => {
    expect(clientUserAgent({ version: '0.1.3', model: 'iPhone 17 Pro', os: 'iOS 26.0' })).toBe(
      'Kroma/0.1.3 (iPhone 17 Pro; iOS 26.0)',
    );
  });

  it('strips what a User-Agent cannot carry', () => {
    // A television named by its owner, in a language a header is not ASCII for,
    // and a model with the format's own delimiters in it.
    expect(clientUserAgent({ version: '1.0', model: 'Télé (salon)', os: 'tvOS 26.0' })).toBe(
      'Kroma/1.0 (Tl salon; tvOS 26.0)',
    );
  });

  it('stays well-formed when a field is missing', () => {
    expect(clientUserAgent({ version: '', model: '', os: '' })).toBe('Kroma/dev (Device; unknown)');
  });
});
