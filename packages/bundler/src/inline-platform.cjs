// Inlines the kit's platform constant for Metro, so native bundles prune on it.
//
// `#ui/lib/platform` exports `WEB` as a module-level literal, which Rollup
// inlines into a web chunk and the minifier prunes on - but Metro keeps every
// module a separate closure, so on native the import stays a runtime read and
// `if (WEB)` branches would ship to a television. Metro already solves this
// exact problem for `Platform.OS`: its inline plugin rewrites the read to a
// string literal and its constant-folding pass (production bundles only)
// deletes the dead branch. This does the same for `WEB`, one step earlier: the
// import statement becomes a `const` literal in the file's own scope, which is
// where Metro's folding can see it.
//
// A text substitution rather than a babel visitor ON PURPOSE: the module has
// one export, the kit imports it one way (biome pins the spelling), and the
// replacement keeps line numbers - source maps stay honest without a remap.

/** Matches the one legal way to import the constant. `platform.web.ts` never
 * resolves under Metro's native platforms, so the plain twin's spelling is the
 * only one that can appear. */
const IMPORT = /import\s*\{\s*WEB\s*\}\s*from\s*['"]#ui\/lib\/platform['"];?/;

/** The source with the platform import collapsed to a literal, or the source
 * untouched when it does not import one. */
function inlinePlatformConst(src, platform) {
  if (!IMPORT.test(src)) return src;
  return src.replace(IMPORT, `const WEB = ${platform === 'web'};`);
}

module.exports = { inlinePlatformConst };
