import { stillArt } from '#ui/lib/sample-art';

import { UP_NEXT_COLUMNS } from './up-next-card';

export /** The sheet's own row, as data: an episode carries its own id, so the row keys
 *  on the episode rather than on where it happens to sit. */
const ROW = Array.from({ length: UP_NEXT_COLUMNS }, (_, at) => ({
  id: `up-next-${at + 5}`,
  title: `Episode ${at + 5}`,
  subtitle: `S1 E${at + 5}`,
  categoryLabel: 'Episode',
  posterUrl: stillArt(at),
}));
