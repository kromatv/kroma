import { describe, expect, it } from 'vitest';
import { featured, on, SERVER, workspaces } from './rust-workspaces';

describe('rust workspaces', () => {
  it('walks the server and every module that has a sidecar', () => {
    const ids = workspaces().map((ws) => ws.id);

    expect(ids[0]).toBe('server');
    expect(ids).toContain('tv.kroma.torrents');
  });

  it('runs a second pass over the workspaces whose tests need a feature on', () => {
    const ids = featured().map((ws) => ws.id);

    expect(ids).toContain('tv.kroma.torrents');
    expect(ids).not.toContain('server');
  });

  it('asks for no feature where a workspace declares none', () => {
    const torrents = featured().find((ws) => ws.id === 'tv.kroma.torrents');

    expect(on(SERVER)).toEqual([]);
    expect(torrents && on(torrents)).toEqual(['--features', 'rqbit']);
  });
});
