// The design's two families as Metro asset registrations, for the native shells
// to feed straight into `useFonts`. On the browser targets the same families
// arrive through a <link> to Google Fonts; here they are bundled, so the lockup
// and the type render identically on a device that has no network yet.
//
// The keys are the family names the typography tokens use (`fonts.display` /
// `fonts.ui`), spelled through the tokens so they can never drift. The literal
// `require(...)` calls are what lets Metro see and bundle the files.

import { fonts } from '../lib/tokens/typography';

export const KIT_FONTS = {
  [fonts.display]: require('./fonts/BricolageGrotesque-ExtraBold.ttf'),
  [fonts.ui]: require('./fonts/HankenGrotesk.ttf'),
};
