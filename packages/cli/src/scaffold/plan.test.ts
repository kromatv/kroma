import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type Answers,
  manifestFor,
  packageJsonFor,
  repoRoot,
  sdkSpec,
  skipInRepo,
  slugOf,
  templateVars,
  treesFor,
  tsconfigFor,
  type Versions,
  versions,
} from './plan';

let dir = '';

function plain(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-plan-'));
  return dir;
}

function repo(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-plan-repo-'));
  mkdirSync(join(dir, 'server'), { recursive: true });
  mkdirSync(join(dir, 'modules'), { recursive: true });
  writeFileSync(
    join(dir, 'server', 'Cargo.toml'),
    '[package]\nname = "kroma-server"\nversion = "1.2.3"\n',
  );
  writeFileSync(join(dir, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.99.0"\n');
  return dir;
}

function answers(over: Partial<Answers> = {}): Answers {
  return {
    id: 'tv.acme.notes',
    name: 'Notes',
    description: 'Jot things down',
    kind: 'full',
    storage: false,
    inRepo: false,
    ...over,
  };
}

const V: Versions = {
  sdk: '1.2.3',
  server: '1.2.3',
  rustChannel: '1.99.0',
};

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('slugOf', () => {
  it('takes the last label of a reverse-DNS id, hyphens and all', () => {
    expect(slugOf('tv.acme.notes')).toBe('notes');
    expect(slugOf('tv.acme.my-notes')).toBe('my-notes');
    expect(slugOf('notes')).toBe('notes');
  });
});

describe('repoRoot', () => {
  it('finds the checkout a nested directory sits in', () => {
    const root = repo();
    const nested = join(root, 'modules', 'tv.acme.notes');
    mkdirSync(nested, { recursive: true });

    expect(repoRoot(nested)).toBe(root);
  });

  it('is null for a directory that is nobody’s checkout', () => {
    expect(repoRoot(plain())).toBeNull();
  });
});

describe('versions', () => {
  it('stands the server’s own version in for the SDK inside the repository', () => {
    const v = versions(repo());

    expect(v.sdk).toBe('1.2.3');
    expect(v.server).toBe('1.2.3');
    expect(v.rustChannel).toBe('1.99.0');
  });

  it('falls back to zeroes outside one, and still pins the kit’s React Native', () => {
    const v = versions(plain());

    expect(v.sdk).toBe('0.0.0');
    expect(v.server).toBe('0.0.0');
    expect(v.rustChannel).toBe('1.98.0');
  });
});

describe('sdkSpec', () => {
  it('links the workspace inside the repository', () => {
    expect(sdkSpec(V, true)).toBe('workspace:*');
  });

  it('pins the published package at this CLI’s version outside it', () => {
    expect(sdkSpec(V, false)).toBe('^1.2.3');
    expect(sdkSpec({ ...V, sdk: '0.0.0' }, false)).toBe('*');
  });
});

describe('treesFor', () => {
  it('renders a kind from the trees that kind has', () => {
    const names = (kind: Answers['kind']) => treesFor(kind).map((t) => basename(t));

    expect(names('full')).toEqual(['base', 'ui', 'server']);
    expect(names('server')).toEqual(['base', 'server']);
    expect(names('ui')).toEqual(['base', 'ui']);
  });
});

describe('skipInRepo', () => {
  it('drops the files the repository already provides', () => {
    expect(skipInRepo('rust-toolchain.toml')).toBe(true);
    expect(skipInRepo('.cargo/config.toml')).toBe(true);
    expect(skipInRepo('.gitignore')).toBe(true);
    expect(skipInRepo('server/Cargo.toml')).toBe(false);
  });
});

describe('templateVars', () => {
  it('names the crate, the page and the struct after the slug', () => {
    const vars = templateVars(answers({ id: 'tv.acme.my-notes' }), V);

    expect(vars).toMatchObject({
      SLUG: 'my-notes',
      PAGE: 'MyNotesPage',
      STRUCT: 'MyNotesModule',
      CRATE: 'kroma-module-my-notes',
      CRATE_IDENT: 'kroma_module_my_notes',
      RUST_CHANNEL: '1.99.0',
    });
  });

  it('points the crates at the workspace in the repository and at node_modules outside it', () => {
    expect(templateVars(answers({ inRepo: true }), V)).toMatchObject({
      SDK: '@kroma/module-sdk',
      SDK_CRATES: '../../../server/crates',
    });
    expect(templateVars(answers(), V)).toMatchObject({
      SDK: '@kromatv/sdk',
      SDK_CRATES: '../node_modules/@kromatv/sdk/rust',
    });
  });

  it('carries a migration and the storage feature only for a module that asked for one', () => {
    const withDb = templateVars(answers({ storage: true }), V);

    expect(withDb.MIGRATIONS).toContain('CREATE TABLE IF NOT EXISTS notes');
    expect(withDb.SDK_FEATURES).toBe(', features = ["storage"]');
    expect(withDb.RUNTIME_FEATURES).toBe(', features = ["storage"]');
    expect(templateVars(answers(), V)).toMatchObject({
      MIGRATIONS: '',
      SDK_FEATURES: '',
      RUNTIME_FEATURES: '',
    });
  });
});

describe('manifestFor', () => {
  it('declares a remote entry for a module with a page and none for a sidecar', () => {
    expect(manifestFor(answers(), V).feRemote).toEqual({ module: './remoteEntry.js' });
    expect(manifestFor(answers({ kind: 'ui' }), V).feRemote).toEqual({
      module: './remoteEntry.js',
    });
    expect(manifestFor(answers({ kind: 'server' }), V).feRemote).toBeUndefined();
  });

  it('declares storage only when the answers asked for it', () => {
    expect(manifestFor(answers({ storage: true }), V).storage).toEqual({ core: {} });
    expect(manifestFor(answers(), V).storage).toBeUndefined();
  });

  it('floors the server range at the version it was written against', () => {
    expect(manifestFor(answers(), V).engines).toEqual({ server: '>=1.2.3' });
    expect(manifestFor(answers(), { ...V, server: '0.0.0' }).engines).toEqual({ server: '*' });
  });
});

describe('packageJsonFor', () => {
  it('is nothing for a sidecar, which has no frontend to install', () => {
    expect(packageJsonFor(answers({ kind: 'server' }), V)).toBeNull();
  });

  it('links the workspace and exports the page inside the repository', () => {
    const pkg = packageJsonFor(answers({ inRepo: true }), V);

    expect(pkg).toMatchObject({
      name: '@kroma/module-notes',
      exports: { '.': './ui/src/module.tsx', './schemas': './ui/src/schemas.ts' },
      dependencies: { '@kroma/module-sdk': 'workspace:*', '@kroma/ui': 'workspace:*' },
    });
    expect(pkg?.overrides).toBeUndefined();
  });

  it('depends on the published SDK outside it, and installs no React Native', () => {
    const pkg = packageJsonFor(answers(), V);

    expect(pkg).toMatchObject({
      name: 'tv.acme.notes',
      dependencies: { '@kromatv/sdk': '^1.2.3' },
      devDependencies: { react: '^19.2.8', '@types/react': '^19.2.18', typescript: '^7.0.2' },
    });
    expect(pkg?.devDependencies).not.toHaveProperty('react-native');
    expect(pkg?.overrides).toBeUndefined();
    expect(pkg?.exports).toBeUndefined();
  });
});

describe('tsconfigFor', () => {
  it('is nothing for a sidecar', () => {
    expect(tsconfigFor(answers({ kind: 'server' }), 0)).toBeNull();
  });

  it('reaches the repository’s base config by how deep the module sits', () => {
    expect(tsconfigFor(answers({ inRepo: true }), 2)?.extends).toBe('../../tsconfig.base.json');
    expect(tsconfigFor(answers({ inRepo: true }), 3)?.extends).toBe('../../../tsconfig.base.json');
  });

  it('extends the published SDK’s config outside it', () => {
    expect(tsconfigFor(answers(), 0)).toEqual({
      extends: '@kromatv/sdk/tsconfig',
      include: ['ui/src'],
    });
  });
});
