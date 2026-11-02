import { describe, expect, it } from 'vitest';
import { componentTable } from './rust-components';
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

describe('the component run', () => {
  it('lists each workspace with its wall time and result', () => {
    const table = componentTable([
      { id: 'tv.kroma.scene', seconds: 12.4, passed: true },
      { id: 'tv.kroma.torrents', seconds: 61.6, passed: false },
    ]);

    expect(table.split('\n')).toEqual([
      '| workspace | wall time | result |',
      '|---|---|---|',
      '| tv.kroma.scene | 12 s | passed |',
      '| tv.kroma.torrents | 62 s | failed |',
    ]);
  });
});
