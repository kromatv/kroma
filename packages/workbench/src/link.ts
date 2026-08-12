// The one door out of the workbench to the platform's browser, shared by a
// doc's links and the toolbar's source link.

import { Linking } from 'react-native';

// `openURL` hands any scheme it is given to the platform: `javascript:` runs on
// a webview, `file:` reads the disk. The two the workbench ever needs are the
// two allowed.
const WEB_LINK = /^https?:\/\//i;

/** Opens `href` in the platform's browser. A URL that is not http(s) opens
 * nothing at all. */
function openWebLink(href: string): void {
  if (!WEB_LINK.test(href)) return;
  Linking.openURL(href).catch(() => undefined);
}

export { openWebLink, WEB_LINK };
