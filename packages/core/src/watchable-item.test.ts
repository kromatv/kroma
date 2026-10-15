import { describe, expect, it } from 'vitest';
import { target } from './react/watch.fixture';
import { watchItem, watchSubjectOf } from './watchable-item';

const MOUNT = '/api/module/tv.example.swarm';

describe('a watch item', () => {
  it('names the file by the mount, the download and its index', () => {
    const playing = target();

    const item = watchItem({ mount: MOUNT, target: playing });

    expect(item).toMatchObject({
      mount: MOUNT,
      id: playing.entry.id,
      file: playing.file.index,
      title: 'Sintel',
      tmdbId: 45745,
    });
  });

  it('falls back to the file name when the download names no title', () => {
    const playing = target();
    playing.entry.title = null;

    expect(watchItem({ mount: MOUNT, target: playing }).title).toBe('Sintel.mkv');
  });

  it('is played by following that one file of that download', () => {
    const item = watchItem({ mount: MOUNT, target: target() });

    expect(watchSubjectOf(item)).toEqual({ kind: 'download', downloadId: item.id, file: 5 });
  });
});
