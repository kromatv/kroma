// The glyphs the build cut, in a chunk of their own. The specifier is the React
// Native one because every web bundler aliases it to the DOM package, as in the
// sibling glyph-source.ts.

import type { GlyphExports } from './glyphs';

/** All of Tabler, fetched on demand. Null where the platform cannot fetch. */
const everyGlyph: (() => Promise<GlyphExports>) | null = async () =>
  (await import('@tabler/icons-react-native')) as GlyphExports;

export { everyGlyph };
