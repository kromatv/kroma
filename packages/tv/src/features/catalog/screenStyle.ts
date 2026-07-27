// Text metrics shared by the browse screens (person, genre picker, genre grid,
// library grid).
//
// These are the 10-foot sizes the design specifies for a screen's hero title and
// its empty state. They lived as a verbatim copy in each screen, which meant
// retuning the title for a different panel size was a hunt for identical
// literals. One home instead, next to the screens that use them.
//
// The eyebrow that used to live here is gone: it is `<Txt variant="overlineTv">`
// in the kit now, because six other screens were each spelling their own.

import { tracking } from '@kroma/ui/kit';
import type { TextStyle } from 'react-native';

/** A screen's hero title. `clamp(34px, 5.5vh, 60px)` resolves to 59px on the
 * fixed 1080-tall stage, so it is spelled as the resolved value. */
export const TITLE: TextStyle = {
  fontSize: 59,
  lineHeight: 58,
  fontWeight: '700',
  letterSpacing: 59 * tracking.display,
};

/** Centred "nothing here" line, held narrow enough to stay readable at 3 metres. */
export const EMPTY: TextStyle = {
  fontSize: 18,
  fontWeight: '500',
  textAlign: 'center',
  maxWidth: 640,
};
