// Fetching the glyphs the build cut, native (Metro).
//
// There is nothing to fetch: Metro has no dynamic import to split the rest of
// Tabler off with, so a native build draws from whatever glyph-source kept and
// the icon browser lists exactly that.

import type { GlyphExports } from './glyphs';

/** All of Tabler, fetched on demand. Null where the platform cannot fetch. */
const everyGlyph: (() => Promise<GlyphExports>) | null = null;

export { everyGlyph };
