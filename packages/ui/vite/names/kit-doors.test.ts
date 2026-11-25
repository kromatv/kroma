import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { kitIo, namesHash, walkKit } from './kit-doors.ts';

const REPO = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'kroma-names-'));
  made.push(root);
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), '');
  }
  return root;
}

describe('kitIo', () => {
  it('resolves a specifier to the file and every platform twin, and nothing else beside it', () => {
    const root = tree(['portal.tsx', 'portal.web.tsx', 'portal.test.tsx', 'portal-host.tsx']);

    const files = kitIo(root).resolve('./portal', join(root, 'door.ts'));

    expect(files.sort()).toEqual([join(root, 'portal.tsx'), join(root, 'portal.web.tsx')]);
  });

  it('resolves a folder to its index and a #ui specifier from the kit root', () => {
    const root = tree(['atoms/index.ts', 'atoms/index.native.ts']);

    const files = kitIo(root).resolve('#ui/atoms', join(root, 'deep/door.ts'));

    expect(files.sort()).toEqual([
      join(root, 'atoms/index.native.ts'),
      join(root, 'atoms/index.ts'),
    ]);
  });

  it('ends the chain at a package or a file that is not there', () => {
    const root = tree(['door.ts']);

    expect(kitIo(root).resolve('react-native', join(root, 'door.ts'))).toEqual([]);
    expect(kitIo(root).resolve('./gone', join(root, 'door.ts'))).toEqual([]);
  });
});

describe('walkKit', () => {
  const walk = walkKit(REPO);
  const names = [...walk.names.values()].flat().map(({ name }) => name);

  it('reads both doors of the real kit', () => {
    expect(names).toEqual(expect.arrayContaining(['Dialog.Footer', 'Column', 'Player.Root']));
  });

  it('hashes the names alone, the same for the same walk', () => {
    expect(namesHash(walk)).toBe(namesHash(walkKit(REPO)));
    expect(namesHash(walk)).not.toBe(namesHash({ names: new Map(), visited: walk.visited }));
  });
});
