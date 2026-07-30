// Metro asset registrations for `useFonts`. The literal `require(...)` calls are
// what lets Metro see and bundle the files.

import { fonts } from '../lib/tokens/typography';

export const KIT_FONTS = {
  [fonts.display]: require('./fonts/BricolageGrotesque-ExtraBold.ttf'),
  [fonts.ui]: require('./fonts/HankenGrotesk.ttf'),
};
