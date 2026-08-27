import { describe, expect, it } from 'vitest';
import { sift } from './dropzone-sift';

const file = (name: string, size: number, type = '') => {
  const made = new File(['x'], name, { type });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};

describe('what a zone takes and what it turns away', () => {
  it('turns away a file bigger than the ceiling, and says which rule it broke', () => {
    const { taken, turned } = sift([file('big.torrent', 2000)], { maxSize: 1000 });

    expect(taken).toEqual([]);
    expect(turned).toEqual([
      { file: expect.objectContaining({ name: 'big.torrent' }), reason: 'size' },
    ]);
  });

  it('matches an extension rule the way the native picker does', () => {
    const { taken, turned } = sift([file('a.torrent', 10), file('b.png', 10)], {
      accept: '.torrent',
    });

    expect(taken.map((f) => f.name)).toEqual(['a.torrent']);
    expect(turned[0]).toMatchObject({ reason: 'type' });
  });

  it('matches an extension whatever case it arrived in', () => {
    const { taken } = sift([file('A.TORRENT', 10)], { accept: '.torrent' });

    expect(taken.map((f) => f.name)).toEqual(['A.TORRENT']);
  });

  it('matches a type family', () => {
    const { taken } = sift([file('a.png', 10, 'image/png')], { accept: 'image/*', multiple: true });

    expect(taken).toHaveLength(1);
  });

  it('matches one exact type without taking its neighbours in the family', () => {
    const dropped = [file('a.png', 10, 'image/png'), file('b.jpg', 10, 'image/jpeg')];

    const { taken, turned } = sift(dropped, { accept: 'image/png', multiple: true });

    expect(taken.map((f) => f.name)).toEqual(['a.png']);
    expect(turned).toMatchObject([{ reason: 'type' }]);
  });

  it('takes a file that satisfies any one rule of several', () => {
    const { taken } = sift([file('a.nfo', 10), file('b.png', 10, 'image/png')], {
      accept: '.torrent, image/*',
      multiple: true,
    });

    expect(taken.map((f) => f.name)).toEqual(['b.png']);
  });

  it('lets a file through on size when it sits exactly on the ceiling', () => {
    const { taken } = sift([file('a.torrent', 1000)], { maxSize: 1000 });

    expect(taken).toHaveLength(1);
  });

  it('reports the type rule and stops, so one file is never turned away twice', () => {
    const { turned } = sift([file('big.png', 2000)], { accept: '.torrent', maxSize: 1000 });

    expect(turned).toMatchObject([{ reason: 'type' }]);
  });

  it('takes only the first when the zone is not multiple, without calling the rest rejected', () => {
    const { taken, turned } = sift([file('a.torrent', 10), file('b.torrent', 10)], {});

    expect(taken.map((f) => f.name)).toEqual(['a.torrent']);
    expect(turned).toEqual([]);
  });

  it('still reports what broke a rule in a single-file zone', () => {
    const { taken, turned } = sift([file('big.torrent', 2000), file('a.torrent', 10)], {
      maxSize: 1000,
    });

    expect(taken.map((f) => f.name)).toEqual(['a.torrent']);
    expect(turned).toMatchObject([{ reason: 'size' }]);
  });

  it('takes everything when nothing narrows it', () => {
    const { taken } = sift([file('a', 1), file('b', 1)], { multiple: true });

    expect(taken).toHaveLength(2);
  });

  it('ignores the empty rule a trailing comma leaves behind', () => {
    const { taken } = sift([file('a.torrent', 10)], { accept: '.torrent,' });

    expect(taken).toHaveLength(1);
  });
});
