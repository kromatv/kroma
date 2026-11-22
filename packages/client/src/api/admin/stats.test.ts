import { describe, expect, it } from 'vitest';
import { PlayEntry } from './stats';

const played = {
  id: 'p1',
  username: 'ana',
  kind: 'movie',
  title: 'Heat',
  startedAt: 1_700_000_000,
  endedAt: 1_700_000_000,
  watchedMs: 10_200_000,
};

describe('a row of the watch history', () => {
  it('names the server an imported play came from, and says its time is the runtime', () => {
    const livingRoom = { importer: 'tv.x.import', name: 'Living room' };

    const imported = PlayEntry.parse({
      ...played,
      importedFrom: livingRoom,
      watchedIsRuntime: true,
    });

    expect(imported.importedFrom).toEqual(livingRoom);
    expect(imported.watchedIsRuntime).toBe(true);
  });

  it('reads an imported play that left its device, player, mode and network blank', () => {
    const blank = { device: null, player: null, mode: null, network: null };
    const noLongerOnRecord = { importer: '', name: '' };

    const imported = PlayEntry.parse({ ...played, ...blank, importedFrom: noLongerOnRecord });

    expect(imported).toMatchObject(blank);
    expect(imported.importedFrom).toEqual(noLongerOnRecord);
  });

  it('names no other server for a play of this server', () => {
    const here = PlayEntry.parse({ ...played, importedFrom: null, watchedIsRuntime: false });

    expect(here.importedFrom).toBeNull();
    expect(here.watchedIsRuntime).toBe(false);
  });

  it('reads a server that brings no play from another', () => {
    const older = PlayEntry.parse(played);

    expect(older.importedFrom).toBeUndefined();
    expect(older.watchedIsRuntime).toBeUndefined();
  });

  it('refuses an origin that is not a server', () => {
    const parsed = PlayEntry.safeParse({ ...played, importedFrom: 'Living room' });

    expect(parsed.success).toBe(false);
  });
});
