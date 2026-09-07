import { describe, expect, it } from 'vitest';
import { remoteEntryUrl, SHARED_MODULES, sharedKey } from './shared';

describe('sharedKey', () => {
  it('hands a shared package back by its own name', () => {
    for (const spec of SHARED_MODULES) expect(sharedKey(spec)).toBe(spec);
  });

  it('reads the public package name as the SDK itself', () => {
    expect(sharedKey('@kromatv/sdk')).toBe('@kroma/module-sdk');
    expect(sharedKey('@kromatv/sdk/shared')).toBeNull();
  });

  it('provides every client domain without listing them', () => {
    expect(sharedKey('@kroma/client/requests')).toBe('@kroma/client/requests');
    expect(sharedKey('@kroma/client/media')).toBe('@kroma/client/media');
    expect(sharedKey('@kroma/client/Requests')).toBeNull();
  });

  it('folds a deep kit import onto the barrel the host holds', () => {
    expect(sharedKey('@kroma/ui/kit/atoms/button')).toBe('@kroma/ui/kit');
    expect(sharedKey('@kroma/ui/kit/molecules/field')).toBe('@kroma/ui/kit');
  });

  it('leaves a package the bundle carries itself alone', () => {
    expect(sharedKey('zod')).toBeNull();
    expect(sharedKey('@tabler/icons-react')).toBeNull();
    expect(sharedKey('@kroma/ui/tokens/colors')).toBeNull();
    expect(sharedKey('./local')).toBeNull();
  });
});

describe('remoteEntryUrl', () => {
  it('points at the fe directory the server serves for the module', () => {
    expect(remoteEntryUrl('http://kroma.local:4040', 'tv.acme.notes')).toBe(
      'http://kroma.local:4040/modules/tv.acme.notes/remoteEntry.js',
    );
  });
});
