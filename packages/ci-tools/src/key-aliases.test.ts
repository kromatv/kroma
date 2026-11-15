import { describe, expect, it } from 'vitest';
import { aliasesOf, keyAliases } from './key-aliases';

const TVOS = { name: 'react-native', target: 'react-native-tvos', range: '0.88.0-0' };

const bunLock = [
  'react-native-tvos@*, "react-native-tvos@>=0.88.0-0", "react-native-tvos@npm:react-native-tvos@0.88.0-0":',
  '  version "0.88.0-0"',
].join('\n');

describe('aliasesOf', () => {
  it('reads an alias from every install-time dependency field, scoped targets included', () => {
    const manifest = {
      dependencies: { 'react-native': 'npm:react-native-tvos@0.88.0-0', zod: '^4.6.7' },
      devDependencies: { types: 'npm:@types/node@22.20.5' },
      optionalDependencies: { local: 'workspace:*' },
      peerDependencies: { react: 'npm:preact@10' },
    };

    expect(aliasesOf(manifest)).toEqual([
      TVOS,
      { name: 'types', target: '@types/node', range: '22.20.5' },
    ]);
  });

  it('finds no alias in a manifest without dependencies', () => {
    expect(aliasesOf({ name: '@kromatv/i18n' })).toEqual([]);
  });
});

describe('keyAliases', () => {
  it('keys an alias under its own name where Bun 1.4.0 keyed it under its target', () => {
    const fixed = keyAliases(bunLock, [TVOS, TVOS]);

    expect(fixed).toContain('"react-native@npm:react-native-tvos@0.88.0-0":');
    expect(fixed).not.toContain('"react-native-tvos@npm:react-native-tvos@0.88.0-0"');
    expect(fixed).toContain('react-native-tvos@*, "react-native-tvos@>=0.88.0-0",');
  });

  it('leaves a lockfile that already keys the alias as Yarn does', () => {
    const yarn = '"react-native@npm:react-native-tvos@0.88.0-0", react-native-tvos@*:';

    expect(keyAliases(yarn, [TVOS])).toBe(yarn);
  });
});
