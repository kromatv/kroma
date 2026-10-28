import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { npmNotices, packageRoot } from './npm-notices';

function install(root: string, name: string, manifest: object, files: Record<string, string> = {}) {
  const dir = join(root, 'node_modules', '.bun', `${name}@1`, 'node_modules', name);
  mkdirSync(join(dir, 'esm'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'esm', 'package.json'), JSON.stringify({ type: 'module' }));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  return dir;
}

describe('packageRoot', () => {
  it('climbs past a nested package.json that names nothing to the package', () => {
    const root = mkdtempSync(join(tmpdir(), 'npm-'));
    const dir = install(root, 'shaka', { name: 'shaka', version: '5.3.1' });

    expect(packageRoot(join(dir, 'esm', 'index.js?commonjs-proxy'))).toBe(dir);
  });

  it('reads a Windows path the way it reads any other', () => {
    const isReact = (dir: string) => dir === 'C:/repo/node_modules/react';

    expect(packageRoot('C:\\repo\\node_modules\\react\\cjs\\react.js', isReact)).toBe(
      'C:/repo/node_modules/react',
    );
  });

  it('leaves this repository and virtual modules out', () => {
    const always = () => true;

    expect(packageRoot('/repo/packages/ui/src/button.tsx', always)).toBeNull();
    expect(packageRoot('\0/repo/node_modules/x/index.js', always)).toBeNull();
  });
});

describe('npmNotices', () => {
  it('reads each package once, with its license, source and license file', () => {
    const root = mkdtempSync(join(tmpdir(), 'npm-'));
    const hls = install(
      root,
      'hls.js',
      {
        name: 'hls.js',
        version: '1.7.3',
        license: 'Apache-2.0',
        repository: { url: 'git+https://x/hls' },
      },
      { LICENSE: 'Apache text' },
    );
    const qr = install(root, 'qrcode', {
      name: 'qrcode',
      version: '2.0.4',
      homepage: 'https://x/qr',
    });

    const notices = npmNotices([
      join(hls, 'esm', 'a.js'),
      join(hls, 'esm', 'b.js'),
      join(qr, 'index.js'),
      '/repo/packages/tv/src/app.tsx',
    ]);

    expect(notices).toEqual([
      {
        name: 'hls.js',
        version: '1.7.3',
        license: 'Apache-2.0',
        source: 'git+https://x/hls',
        texts: ['Apache text'],
      },
      { name: 'qrcode', version: '2.0.4', license: null, source: 'https://x/qr', texts: [] },
    ]);
  });
});
