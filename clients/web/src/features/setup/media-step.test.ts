import { AdminLibrary } from '@kromatv/client/library';
import { expect, it } from 'vitest';
import { folderName, ownLibraries } from './media-step.component';

const library = ({ id, demo }: { id: string; demo: boolean }) =>
  AdminLibrary.parse({
    id,
    name: id,
    kind: 'film',
    folders: [`/media/${id}`],
    itemCount: 0,
    sizeBytes: 0,
    lastScan: null,
    autoScan: true,
    demo,
  });

it('names a library after the last folder of its path, on either kind of path', () => {
  expect(folderName('/volume1/video/Films')).toBe('Films');
  expect(folderName('D:\\Media\\Series\\')).toBe('Series');
});

it('does not count the demo libraries as an answer to where the media is', () => {
  const own = ownLibraries([
    library({ id: 'demo', demo: true }),
    library({ id: 'films', demo: false }),
  ]);

  expect(own.map((each) => each.id)).toEqual(['films']);
});
