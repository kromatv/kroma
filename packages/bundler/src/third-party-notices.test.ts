import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ThirdPartyNoticesOptions, thirdPartyNotices } from './third-party-notices';

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

  it('leaves the Rust crates out with a warning when cargo fails on a laptop', () => {
    const { root, module } = project();
    vi.stubEnv('CI', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [file] = build({ title: 'T', cargo: { manifest: 'missing/Cargo.toml' } }, root, module);

    expect(file?.source).not.toContain('Rust crates');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('fails the build when cargo fails under CI', () => {
    const { root, module } = project();
    vi.stubEnv('CI', 'true');

    expect(() =>
      build({ title: 'T', cargo: { manifest: 'missing/Cargo.toml' } }, root, module),
    ).toThrow();
  });
});
