import { describe, expect, it } from 'vitest';
import { featured, on, SERVER, workspaces } from './rust-workspaces';

describe('rust workspaces', () => {
  it('walks the server and every module that has a server crate', () => {
    const ids = workspaces().map((ws) => ws.id);

    expect(ids[0]).toBe('server');
    expect(ids).toContain('tv.kroma.torrents');
  });

  it('runs a second pass over the workspaces whose bundle ships a feature', () => {
    const ids = featured().map((ws) => ws.id);

    expect(ids).toContain('tv.kroma.whisper');
    expect(ids).not.toContain('tv.kroma.torrents');
    expect(ids).not.toContain('server');
  });

  it('asks for the features a bundle ships with, and none where it ships none', () => {
    const whisper = featured().find((ws) => ws.id === 'tv.kroma.whisper');

    expect(on(SERVER)).toEqual([]);
    expect(whisper && on(whisper)).toEqual(['--features', 'local']);
  });
});
