// Text metrics shared by the browse screens (person, genre picker, genre
// grid, library grid): the 10-foot sizes the design specifies for a screen's
// hero title and its empty state.

import { tracking } from '@kroma/ui/kit';
import type { TextStyle } from 'react-native';

// `clamp(34px, 5.5vh, 60px)` resolves to 59px on the fixed 1080-tall stage,
// so it is spelled as the resolved value.
export const TITLE: TextStyle = {
  fontSize: 59,
  lineHeight: 58,
  fontWeight: '700',
  letterSpacing: 59 * tracking.display,
};

export const EMPTY: TextStyle = {
  fontSize: 18,
  fontWeight: '500',
  textAlign: 'center',
  maxWidth: 640,
};
