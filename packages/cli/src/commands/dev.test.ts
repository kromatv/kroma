import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Project } from '../project';
import { partOf } from './dev';

const project: Project = {
  dir: '/modules/tv.acme.notes',
  manifest: { id: 'tv.acme.notes', name: 'Notes', version: '0.1.0' },
  server: null,
  ui: null,
};

const part = (rel: string) => partOf(project, join(project.dir, rel));

describe('partOf', () => {
  it('rebuilds the sidecar for a source file or the crate manifest', () => {
    expect(part('server/src/lib.rs')).toBe('server');
    expect(part('server/Cargo.toml')).toBe('server');
    expect(part('server/src/notes.txt')).toBeNull();
  });

  it('rebuilds the frontend for its sources, its catalogs and the manifest', () => {
    expect(part('ui/src/module.tsx')).toBe('ui');
    expect(part('locales/en.json')).toBe('ui');
    expect(part('module.json')).toBe('ui');
  });

  it('repacks the bundle for the icon, which neither half compiles', () => {
    expect(part('icon.svg')).toBe('bundle');
    expect(part('icon.png')).toBe('bundle');
  });

  it('ignores what the build itself writes', () => {
    expect(part('ui/dist/remoteEntry.js')).toBeNull();
    expect(part('ui/node_modules/react/index.js')).toBeNull();
    expect(part('dist/dev/tv.acme.notes.kmod')).toBeNull();
    expect(part('.bundle/module.json')).toBeNull();
  });

  it('ignores a file outside the module', () => {
    expect(partOf(project, '/modules/tv.acme.other/ui/src/module.tsx')).toBeNull();
  });
});
