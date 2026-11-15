import { describe, expect, it } from 'vitest';
import { checkWorkspace } from './check.ts';
import { workspace } from './workspace.ts';

describe('the catalogs of this repository', () => {
  it('hold: every file, every translation and every lock', () => {
    expect(checkWorkspace(workspace())).toEqual([]);
  });

  it('name the app first, then every module that ships messages, then the website', () => {
    const [app, ...rest] = workspace();

    expect(app?.name).toBe('core');
    expect(rest.at(-1)?.name).toBe('www');
    expect(rest.every((set) => set.layout === 'flat' && set.project.source === 'en')).toBe(true);
  });
});
