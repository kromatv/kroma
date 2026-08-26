// The ground every TV shell's document states before its bundle loads.
//
// The rules live in `tv-shell-head.html` beside this file, not in a string here:
// a shell's document is HTML, and the one thing this module does is put the same
// HTML in every shell rather than each keeping its own copy of it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HEAD = fileURLToPath(new URL('./tv-shell-head.html', import.meta.url));

interface HtmlPlugin {
  name: string;
  transformIndexHtml: (html: string) => string;
}

/** Injects the shared head into a shell's document, on the dev server and in a
 *  build alike: the ground has to be there before the bundle either way. */
export function tvShellHead(): HtmlPlugin {
  return {
    name: 'kroma:tv-shell-head',
    transformIndexHtml: (html) => html.replace('</head>', `${readFileSync(HEAD, 'utf8')}</head>`),
  };
}
