import { describe, expect, it } from 'vitest';
import { declarationOf, type PackageJson, pathsFor, sdkManifest, tsconfigPreset } from './manifest';

const UI: PackageJson = {
  name: '@kroma/ui',
  version: '0.0.0',
  private: true,
  exports: {
    '.': './src/index.ts',
    './kit': './src/kit.ts',
    './kit/*': './src/components/*/index.ts',
    './vite': './vite/index.ts',
  },
  dependencies: {
    '@kroma/core': 'workspace:*',
    'react-native-svg': '^15',
    '@tabler/icons-react-native': '^3',
  },
  peerDependencies: {
    react: '^19',
    'react-dom': '>=18',
    'react-native': '*',
    'expo-video': '~57',
  },
};

const CLIENT: PackageJson = {
  name: '@kroma/client',
  version: '0.0.0',
  exports: { '.': './src/index.ts', './*': './src/api/*/index.ts' },
  dependencies: { zod: '^4' },
};

const SDK: PackageJson = {
  name: '@kroma/module-sdk',
  version: '0.0.0',
  description: 'the contract',
  exports: { '.': './src/index.ts', './shared': './src/shared.ts', './vite': './vite.ts' },
  dependencies: {
    '@kroma/ui': 'workspace:*',
    '@tanstack/react-query': '^5',
    '@tanstack/react-table': '^8',
  },
  peerDependencies: { react: '^19' },
};

const CLI: PackageJson = {
  name: '@kroma/cli',
  version: '0.0.0',
  dependencies: {
    '@kroma/module-sdk': 'workspace:*',
    '@clack/prompts': '1.7.0',
    citty: '0.2.2',
    'es-module-lexer': '^2',
    hono: '^4',
    'magic-string': '^0.30',
    vite: '8.2.1',
    zod: '^4',
  },
  kroma: { reactNative: 'npm:react-native-tvos@0.86.0-2' },
};

describe('declarationOf', () => {
  it('maps a source target onto its declaration inside the SDK package', () => {
    expect(declarationOf('ui', './src/kit.ts')).toBe('./types/ui/src/kit.d.ts');
    expect(declarationOf('ui', './src/components/*/index.ts')).toBe(
      './types/ui/src/components/*/index.d.ts',
    );
  });

  it('answers nothing for a target outside src', () => {
    expect(declarationOf('ui', './vite/index.ts')).toBeNull();
  });
});

describe('pathsFor', () => {
  it('maps every package name and subpath the declarations use, patterns included', () => {
    expect(
      pathsFor([
        ['ui', UI],
        ['client', CLIENT],
      ]),
    ).toEqual({
      '@kroma/ui': ['./types/ui/src/index.d.ts'],
      '@kroma/ui/kit': ['./types/ui/src/kit.d.ts'],
      '@kroma/ui/kit/*': ['./types/ui/src/components/*/index.d.ts'],
      '@kroma/client': ['./types/client/src/index.d.ts'],
      '@kroma/client/*': ['./types/client/src/api/*/index.d.ts'],
    });
  });
});

describe('tsconfigPreset', () => {
  it('keeps the compiler options and adds the paths', () => {
    const preset = JSON.parse(tsconfigPreset('{"compilerOptions":{"strict":true}}', [['ui', UI]]));

    expect(preset.compilerOptions.strict).toBe(true);
    expect(preset.compilerOptions.paths['@kroma/ui/kit']).toEqual(['./types/ui/src/kit.d.ts']);
  });
});

describe('sdkManifest', () => {
  const pkg = JSON.parse(
    sdkManifest(
      SDK,
      [
        ['ui', UI],
        ['client', CLIENT],
        ['module-sdk', SDK],
      ],
      CLI,
      '0.1.40',
    ),
  );

  it('is the one public package, with the CLI as its bin', () => {
    expect(pkg.name).toBe('@kromatv/sdk');
    expect(pkg.version).toBe('0.1.40');
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig).toEqual({ access: 'public' });
    expect(pkg.bin).toEqual({ kroma: './dist/cli.js' });
    expect(pkg.exports['.']).toEqual({ types: './types/module-sdk/src/index.d.ts' });
    expect(pkg.exports['./tsconfig']).toBe('./tsconfig.module.json');
    expect(pkg.kroma).toEqual(CLI.kroma);
  });

  it('installs Vite and nothing else: the CLI carries the rest, the types degrade gracefully', () => {
    expect(pkg.dependencies).toEqual({ vite: '8.2.1' });
    expect(pkg.peerDependencies).toEqual({
      react: '^19',
      'react-dom': '>=18',
      'react-native': '*',
    });
  });

  it("points the kit's private alias at its declarations", () => {
    expect(pkg.imports).toEqual({
      '#ui/*': { types: ['./types/ui/src/*.d.ts', './types/ui/src/*/index.d.ts'] },
    });
  });
});
