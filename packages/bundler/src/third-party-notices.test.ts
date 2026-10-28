import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ThirdPartyNoticesOptions, thirdPartyNotices } from './third-party-notices';

const cargo = vi.hoisted(() => ({ notices: vi.fn() }));
vi.mock('./cargo-notices.ts', () => ({ cargoNotices: cargo.notices }));

interface Emitted {
  fileName: string;
  source: string;
}

interface Hooks {
  apply: string;
  configResolved: (config: { root: string }) => void;
  generateBundle: (
    this: { emitFile: (file: Emitted) => void },
    options: unknown,
    bundle: Record<string, { type: string; modules?: Record<string, unknown> }>,
  ) => void;
}

function project(): { root: string; module: string } {
  const root = mkdtempSync(join(tmpdir(), 'notices-'));
  mkdirSync(join(root, 'licenses'));
  writeFileSync(join(root, 'licenses', 'native.txt'), 'Media libraries\n===============\n');
  const pkg = join(root, 'node_modules', 'react');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'react', version: '19.3.0', license: 'MIT' }),
  );
  writeFileSync(join(pkg, 'LICENSE'), 'React MIT text');
  return { root, module: join(pkg, 'index.js') };
}

function build(options: ThirdPartyNoticesOptions, root: string, module: string): Emitted[] {
  const hooks = thirdPartyNotices(options) as unknown as Hooks;
  hooks.configResolved({ root });
  const emitted: Emitted[] = [];
  hooks.generateBundle.call(
    { emitFile: (file) => emitted.push(file) },
    {},
    {
      'index.js': { type: 'chunk', modules: { [module]: {}, [join(root, 'src/main.tsx')]: {} } },
      'style.css': { type: 'asset' },
    },
  );
  return emitted;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  cargo.notices.mockReset();
});

describe('thirdPartyNotices', () => {
  it('writes the title, the hand-written notices and the bundled packages, for a build only', () => {
    const { root, module } = project();

    const [file] = build(
      { title: 'KROMA desktop', include: ['licenses/native.txt'] },
      root,
      module,
    );

    expect(thirdPartyNotices({ title: 'x' }).apply).toBe('build');
    expect(file?.fileName).toBe('THIRD-PARTY-NOTICES.txt');
    expect(file?.source).toMatch(/^KROMA desktop\n\n\nMedia libraries\n/);
    expect(file?.source).toContain('JavaScript packages');
    expect(file?.source).toContain('  react 19.3.0  MIT');
    expect(file?.source).toContain('React MIT text');
  });

  it('lists the crates of the Cargo.toml it is given, for the targets named', () => {
    const { root, module } = project();
    cargo.notices.mockReturnValue([
      { name: 'serde', version: '1.0.0', license: 'MIT', source: null, texts: ['Serde text'] },
    ]);

    const options = { manifest: 'src-tauri/Cargo.toml', targets: ['aarch64-apple-darwin'] };
    const [file] = build({ title: 'T', cargo: options }, root, module);

    expect(cargo.notices).toHaveBeenCalledWith(join(root, 'src-tauri/Cargo.toml'), [
      'aarch64-apple-darwin',
    ]);
    expect(file?.source).toContain('Rust crates\n===========\n\n  serde 1.0.0  MIT');
    expect(file?.source.indexOf('Rust crates')).toBeLessThan(
      file?.source.indexOf('JavaScript packages') ?? 0,
    );
  });

  it('leaves the Rust crates out with a warning when cargo fails on a laptop', () => {
    const { root, module } = project();
    cargo.notices.mockImplementation(() => {
      throw new Error('cargo: command not found');
    });
    vi.stubEnv('CI', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [file] = build({ title: 'T', cargo: { manifest: 'Cargo.toml' } }, root, module);

    expect(file?.source).not.toContain('Rust crates');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('fails the build when cargo fails under CI', () => {
    const { root, module } = project();
    cargo.notices.mockImplementation(() => {
      throw new Error('cargo: command not found');
    });
    vi.stubEnv('CI', 'true');

    expect(() => build({ title: 'T', cargo: { manifest: 'Cargo.toml' } }, root, module)).toThrow(
      'cargo: command not found',
    );
  });
});
