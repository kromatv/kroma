// Nothing to fetch: Metro has no dynamic import to split the rest of Tabler off
// with, so a native build draws from whatever glyph-source kept.

import type { GlyphExports } from './glyphs';

/** All of Tabler, fetched on demand. Null where the platform cannot fetch. */
const everyGlyph: (() => Promise<GlyphExports>) | null = null;

export { everyGlyph };
