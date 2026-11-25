import { describe, expect, it } from 'vitest';
import { type DoorIo, walkDoors } from './door-walk.ts';

function io(files: Record<string, string>, twins: Record<string, string[]> = {}): DoorIo {
  return {
    read: (file) => files[file] ?? '',
    resolve(specifier) {
      const file = `/${specifier.replace(/^\.\//, '').replace(/^#ui\//, '')}`;
      return twins[file] ?? (file in files ? [file] : []);
    },
  };
}

const walk = (files: Record<string, string>, twins?: Record<string, string[]>) =>
  Object.fromEntries(walkDoors(['/door'], io(files, twins)).names);

describe('the door walk', () => {
  it('names a component after the name the door gives it', () => {
    const names = walk({
      '/door': "export { Inner as Button } from './button';",
      '/button': 'export function Inner() {}',
    });

    expect(names).toEqual({ '/button': [{ target: 'Inner', name: 'Button' }] });
  });

  it('follows export star through an index to the declaring file', () => {
    const names = walk({
      '/door': "export * from './atoms';",
      '/atoms': "export * from '#ui/box';",
      '/box': 'const Box = () => null;\nconst Column = () => null;\nexport { Box, Column };',
    });

    expect(names['/box']).toEqual([
      { target: 'Box', name: 'Box' },
      { target: 'Column', name: 'Column' },
    ]);
  });

  it('follows a local export bound to an import', () => {
    const names = walk({
      '/door': "import { Box as Local } from './box';\nexport { Local as Frame };",
      '/box': 'export const Box = memo(Inner);',
    });

    expect(names).toEqual({ '/box': [{ target: 'Box', name: 'Frame' }] });
  });

  it('names each part of a namespace, through its member where it holds no identifier', () => {
    const names = walk({
      '/door': "export { PageHeader } from './page-header';",
      '/page-header': "export const PageHeader = { Root, Back: tag(Back, 'back') };",
    });

    expect(names['/page-header']).toEqual([
      { target: 'Root', name: 'PageHeader.Root' },
      { target: 'PageHeader.Back', name: 'PageHeader.Back' },
    ]);
  });

  it('names every platform twin that declares the export', () => {
    const names = walk(
      {
        '/door': "export { Portal } from './portal';",
        '/portal.tsx': 'export function Portal() {}',
        '/portal.web.tsx': 'export const Portal = () => null;',
      },
      { '/portal': ['/portal.tsx', '/portal.web.tsx'] },
    );

    expect(Object.keys(names)).toEqual(['/portal.tsx', '/portal.web.tsx']);
  });

  it('names nothing that is not PascalCase, not function-like, typed, or out of the kit', () => {
    const names = walk({
      '/door': [
        "export { useBox, KROMA, Schema, type Props } from './box';",
        "export { View } from 'react-native';",
      ].join('\n'),
      '/box':
        'export const useBox = () => null;\nexport const KROMA = () => null;\nexport const Schema = { a: 1 };',
    });

    expect(names).toEqual({});
  });

  it('lets an explicit export win over a star, and survives a cycle', () => {
    const names = walk({
      '/door': "export * from './a';\nexport { Real as Button } from './b';",
      '/a': "export * from './door';\nexport function Button() {}",
      '/b': 'export function Real() {}',
    });

    expect(names).toEqual({ '/b': [{ target: 'Real', name: 'Button' }] });
  });

  it('lists every file it read', () => {
    const files = { '/door': "export * from './a';", '/a': 'export function A() {}' };

    expect([...walkDoors(['/door'], io(files)).visited]).toEqual(['/door', '/a']);
  });
});
