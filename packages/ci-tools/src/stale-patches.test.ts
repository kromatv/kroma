import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { root } from './root';
import { stalePatches } from './stale-patches';

const lock = [
  '{',
  '  "packages": {',
  '    "expo-video": ["expo-video@58.0.12", "", {}, "sha512-x"],',
  '    "react-native": ["react-native-tvos@0.88.0-0", "", {}, "sha512-y"],',
  '    "@expo/cli": ["@expo/cli@58.1.13", "", {}, "sha512-z"],',
].join('\n');

const patching = (...keys: string[]) => ({
  patchedDependencies: Object.fromEntries(keys.map((key) => [key, `patches/${key}.patch`])),
});

describe('stalePatches', () => {
  it('passes when the lockfile resolves every patched version, scoped or aliased', () => {
    const manifest = patching(
      'expo-video@58.0.12',
      'react-native-tvos@0.88.0-0',
      '@expo/cli@58.1.13',
    );

    expect(stalePatches(manifest, lock)).toEqual([]);
  });

  it('names a patch whose package moved past the patched version', () => {
    const manifest = patching('expo-video@58.0.11', '@expo/cli@58.1.13');

    expect(stalePatches(manifest, lock)).toEqual(['expo-video@58.0.11']);
  });

  it('does not take a longer version for the patched one', () => {
    const manifest = patching('expo-video@58.0.1');

    expect(stalePatches(manifest, lock)).toEqual(['expo-video@58.0.1']);
  });

  it('has nothing to check in a manifest without patches', () => {
    expect(stalePatches({}, lock)).toEqual([]);
  });

  it('finds every patch of this repository in its bun.lock', () => {
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const repoLock = readFileSync(join(root, 'bun.lock'), 'utf8');

    expect(stalePatches(manifest, repoLock)).toEqual([]);
  });
});
