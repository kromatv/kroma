import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { kromaNames } from './index.ts';

const REPO = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

const BOX = `${REPO}/packages/ui/src/components/atoms/box/box.component.tsx`;

function started() {
  const plugin = kromaNames({ repoRoot: REPO });
  plugin.buildStart();
  return plugin;
}

describe('kromaNames', () => {
  it('runs before the React Compiler, on the source as written', () => {
    expect(kromaNames({ repoRoot: REPO })).toMatchObject({
      enforce: 'pre',
      transform: { order: 'pre' },
    });
  });

  it('names what the doors export from a module, a query on the id included', () => {
    const out = started().transform.handler('', `${BOX}?v=1`);

    expect(out?.code).toContain('__kromaName(Column, "Column");');
  });

  it('leaves a module the doors do not reach alone', () => {
    expect(
      started().transform.handler('', `${REPO}/packages/ui/src/lib/dismiss-backdrop.component.tsx`),
    ).toBeNull();
  });

  it('drops the modules whose names moved when a file it read changes, and no other', () => {
    const root = mkdtempSync(join(tmpdir(), 'kroma-names-'));
    const src = join(root, 'packages', 'ui', 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'index.ts'), '');
    writeFileSync(join(src, 'kit.ts'), "export { Button } from './button';");
    writeFileSync(
      join(src, 'button.tsx'),
      'export function Button() {}\nexport function Badge() {}',
    );
    const button = { id: 'button' };
    const invalidateModule = vi.fn();
    const plugin = kromaNames({ repoRoot: root });
    plugin.configureServer({
      moduleGraph: { getModulesByFile: () => new Set([button]), invalidateModule },
    });
    plugin.buildStart();

    plugin.watchChange(join(src, 'kit.ts'));
    writeFileSync(join(src, 'kit.ts'), "export { Badge, Button } from './button';");
    plugin.watchChange(join(root, 'README.md'));
    plugin.watchChange(join(src, 'kit.ts'));
    rmSync(root, { recursive: true, force: true });

    expect(invalidateModule).toHaveBeenCalledTimes(1);
    expect(invalidateModule).toHaveBeenCalledWith(button);
  });

  it('keys the test runner cache on the names a module gets', () => {
    const keys: ((context: { id: string }) => string)[] = [];

    started().configureVitest({ defineCacheKeyGenerator: (key) => keys.push(key) });

    expect(keys[0]?.({ id: `${BOX}?v=1` })).toContain('"Column"');
    expect(keys[0]?.({ id: `${REPO}/README.md` })).toBe('kroma-names:[]');
  });

  it('reports how many names a build appended, from zero each build', () => {
    const plugin = started();
    const info = vi.fn();

    plugin.transform.handler('', BOX);
    plugin.buildStart();
    plugin.transform.handler('', BOX);
    plugin.buildEnd.call({ info });

    expect(info).toHaveBeenCalledWith(
      '[kroma-names] 4 names appended to the modules this build loaded',
    );
  });
});
