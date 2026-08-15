import type { ControlId } from '#ui/components/organisms/player/lib/nav';

import type { SubtitleGenBundle } from './settings/gen';

export /** No server behind the workbench, so nothing can be generated: `canCreate` off
 *  is the honest state, and the wizard hides itself rather than offering a button
 *  that cannot work. The `Generating` scene below turns it on. */
const NO_GEN: SubtitleGenBundle = {
  canCreate: false,
  caps: null,
  pending: [],
  onCancel: () => {},
  onDelete: () => {},
  onStart: () => {},
};

export /** What `chromeMetrics` hands over at phone width (see ../lib/metrics): the
 *  controls the transport row had no room for. `audio` and `subtitles` are in it
 *  too - the panel ignores those two, because the menu already lists them. */
const NARROW_OVERFLOW: ControlId[] = ['next', 'volume', 'subtitles', 'audio', 'cast', 'pip'];
