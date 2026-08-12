// Fetching the glyphs the build cut, web (the workbench, in a browser).
//
// Its own chunk, so the entry carries the scanned subset alone; the specifier is
// the React Native one because every web bundler aliases it to the DOM package
// (see the sibling glyph-source.ts).

import type { GlyphExports } from './glyphs';

/** All of Tabler, fetched on demand. Null where the platform cannot fetch. */
const everyGlyph: (() => Promise<GlyphExports>) | null = async () =>
  (await import('@tabler/icons-react-native')) as GlyphExports;

export { everyGlyph };
