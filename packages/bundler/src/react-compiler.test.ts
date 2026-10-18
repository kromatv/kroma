import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { reactCompiler } from './react-compiler';
import { compileReactSource } from './react-compiler-transform.cjs';

const source = `import { createElement } from 'react';
export function Counter({value}: {value: number}) {
 return <span>{value + 1}</span>;
}`;

describe('Oxc React Compiler', () => {
  it('memoizes original TSX, preserves JSX for Vite and emits source maps', () => {
    const result = compileReactSource(source, '/app/Counter.tsx');
    expect(result?.code).toContain('react/compiler-runtime');
    expect(result?.code).toContain('<span>');
    expect(result?.code).not.toContain('value: number');
    expect(result?.map?.sources).toEqual(['/app/Counter.tsx']);
    expect(result?.map?.sourcesContent).toEqual([source]);
  });
  it('runs before JSX lowering and Refresh', () => {
    expect(reactCompiler()).toMatchObject({ enforce: 'pre', transform: { order: 'pre' } });
  });
  it('ignores dependencies, virtual modules, declaration files and asset requests', () => {
    for (const id of [
      '/node_modules/pkg/index.tsx',
      '\0virtual.tsx',
      '/app/types.d.ts',
      '/app/a.tsx?raw',
      '/app/a.tsx?url',
      '/app/a.css',
      '/app/a.story.mdx',
    ]) {
      expect(compileReactSource('not JavaScript', id)).toBeNull();
    }
  });
  it('honors use no memo without silently applying memoization', () => {
    const result = compileReactSource(
      'export function Plain({x}) { "use no memo"; return <b>{x}</b> }',
      '/app/Plain.jsx',
    );
    expect(result?.code).not.toContain('react/compiler-runtime');
  });
  it('reports a fatal transform with its source filename', () => {
    expect(() => compileReactSource('export function Broken( {', '/app/Broken.tsx')).toThrow(
      '/app/Broken.tsx',
    );
  });
  it('composes with Vite JSX lowering and development Fast Refresh', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kroma-oxc-react-'));
    const file = join(dir, 'Counter.tsx');
    writeFileSync(file, source);
    const server = await createServer({
      configFile: false,
      root: process.cwd(),
      appType: 'custom',
      plugins: [reactCompiler(), react()],
      resolve: {
        alias: { react: dirname(createRequire(import.meta.url).resolve('react/package.json')) },
      },
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, fs: { allow: [process.cwd(), dir] } },
    });
    try {
      const result = await server.transformRequest(`/@fs/${file}`);
      expect(result?.code).toContain('react/compiler-runtime');
      expect(result?.code).toContain('$RefreshReg$');
      expect(result?.code).not.toContain('<span>');
      const map = result?.map;
      expect(map && 'sourcesContent' in map ? map.sourcesContent : undefined).toContain(source);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
