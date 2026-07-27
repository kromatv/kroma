// The on-disk side of offline downloads.
//
// `sweepOrphans` is the one worth the most care here: it DELETES, it runs
// unattended at startup, and the files it walks are multi-gigabyte films a
// viewer chose to keep. Reclaiming a partial nobody points at is the feature;
// reclaiming one byte more is losing someone's download on a plane.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Typed with the real signatures, so the assertions below can read the
// arguments each call was made with.
const fs = vi.hoisted(() => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: vi.fn(async (_uri: string, _opts?: unknown) => undefined),
  readAsStringAsync: vi.fn(async (_uri: string) => '[]'),
  writeAsStringAsync: vi.fn(async (_uri: string, _contents: string) => undefined),
  readDirectoryAsync: vi.fn(async (_uri: string): Promise<string[]> => []),
  deleteAsync: vi.fn(async (_uri: string, _opts?: unknown) => undefined),
}));

vi.mock('expo-file-system/legacy', () => fs);

const { DIR, deleteEntryFiles, formatBytes, mediaPath, readIndex, sweepOrphans, writeIndex } =
  await import('./store');

/** The shape sweepOrphans reads: a media file plus whatever sidecars it owns. */
const entry = (id: string, extras: { subs?: string[]; sprite?: string } = {}) =>
  ({
    itemId: id,
    fileUri: `${DIR}${id}.mp4`,
    ...(extras.subs
      ? { subs: extras.subs.map((p, i) => ({ index: i, language: null, path: p })) }
      : null),
    ...(extras.sprite ? { storyboard: { spritePath: extras.sprite } } : null),
  }) as never;

/** Everything deleteAsync was asked to remove, in call order. */
const deleted = () => fs.deleteAsync.mock.calls.map(([uri]) => uri);

beforeEach(() => {
  for (const fn of Object.values(fs)) if (typeof fn !== 'string') fn.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mediaPath', () => {
  it('puts the media beside the manifest, named for its item', () => {
    expect(mediaPath('abc', 'mp4')).toBe(`${DIR}abc.mp4`);
  });
});

describe('readIndex', () => {
  it('parses the manifest', async () => {
    fs.readAsStringAsync.mockResolvedValueOnce(JSON.stringify([{ itemId: 'a' }]));
    await expect(readIndex()).resolves.toEqual([{ itemId: 'a' }]);
  });

  // A first launch has no file, and a half-written one is corrupt. Neither is
  // an error the app can act on: an empty index means "nothing downloaded".
  it('reads as empty when the manifest is missing or corrupt', async () => {
    fs.readAsStringAsync.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(readIndex()).resolves.toEqual([]);
    fs.readAsStringAsync.mockResolvedValueOnce('{not json');
    await expect(readIndex()).resolves.toEqual([]);
  });
});

describe('writeIndex', () => {
  it('creates the directory before writing into it', async () => {
    await writeIndex([]);
    expect(fs.makeDirectoryAsync).toHaveBeenCalled();
    expect(fs.writeAsStringAsync).toHaveBeenCalled();
  });
});

describe('sweepOrphans', () => {
  it('reclaims a file no entry claims', async () => {
    fs.readDirectoryAsync.mockResolvedValueOnce(['keep.mp4', 'orphan.mp4']);
    await sweepOrphans([entry('keep')]);
    expect(deleted()).toEqual([`${DIR}orphan.mp4`]);
  });

  it('never touches the manifests themselves', async () => {
    fs.readDirectoryAsync.mockResolvedValueOnce(['index.json', 'wanted.json']);
    await sweepOrphans([]);
    expect(deleted()).toEqual([]);
  });

  it('keeps an entry’s sidecars, not just its media', async () => {
    fs.readDirectoryAsync.mockResolvedValueOnce(['a.mp4', 'a.en.vtt', 'a.sprite.jpg', 'stray.bin']);
    await sweepOrphans([entry('a', { subs: [`${DIR}a.en.vtt`], sprite: `${DIR}a.sprite.jpg` })]);
    expect(deleted()).toEqual([`${DIR}stray.bin`]);
  });

  // The whole reason `live` exists: a transfer still running has no index entry
  // yet, so without this its partial file looks exactly like an orphan - and
  // deleting it mid-flight destroys a download in progress.
  it('spares an in-flight transfer and the Android .tmp it stages through', async () => {
    fs.readDirectoryAsync.mockResolvedValueOnce(['live.mp4', 'live.mp4.tmp', 'dead.mp4']);
    await sweepOrphans([], [`${DIR}live.mp4`]);
    expect(deleted()).toEqual([`${DIR}dead.mp4`]);
  });

  it('does nothing when the directory cannot be read', async () => {
    fs.readDirectoryAsync.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(sweepOrphans([])).resolves.toBeUndefined();
    expect(deleted()).toEqual([]);
  });
});

describe('deleteEntryFiles', () => {
  it('removes the media and every sidecar it owns', async () => {
    await deleteEntryFiles(entry('a', { subs: [`${DIR}a.en.vtt`], sprite: `${DIR}a.sprite.jpg` }));
    expect(deleted().sort()).toEqual(
      [`${DIR}a.en.vtt`, `${DIR}a.mp4`, `${DIR}a.sprite.jpg`].sort(),
    );
  });
});

describe('formatBytes', () => {
  it('reads in GB above a gigabyte and MB below it', () => {
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
    expect(formatBytes(700 * 1024 ** 2)).toBe('700 MB');
  });

  it('shows nothing-yet as 0 MB rather than a negative or NaN', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(-1)).toBe('0 MB');
  });
});
