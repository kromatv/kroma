// Where the glyphs come from AT RUNTIME - the whole of Tabler.
//
// This is the only module that pulls the icons in, which is the point: glyphs.ts
// imports Tabler `import type` (erased), so `IconName` stays every name the
// package can draw and any of them typechecks, while what actually ships is
// decided here. A TV build replaces this file's contents with the same two
// exports built from only the names the source mentions - see
// packages/ui/bundler. The web and admin clients keep the full
// namespace, because they render module UIs whose manifests may name any glyph.

import * as Tabler from '@tabler/icons-react-native';

/** Drawn in place of a name the set does not have. */
export const FALLBACK = Tabler.IconHelpCircle;

export * as EXPORTS from '@tabler/icons-react-native';
