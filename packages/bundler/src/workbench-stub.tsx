// The workbench, as the LEGACY tier sees it: absent.
//
// `@kroma/tv`'s mount lazily imports the design-system workbench so `?workbench`
// can open it on any target. On the modern tiers that is a separate chunk
// nobody downloads unless they ask for it. The legacy tier has no chunks - it is
// one classic IIFE with `inlineDynamicImports`, so the lazy import is inlined
// and every story, prop table and guideline string ships to a 2018 television
// that will never render them.
//
// That cost was not the only problem. `check-legacy.ts` guards the bundle by
// grepping the built JS for syntax old engines cannot parse, and story prose is
// full of code samples: a `usage:` string containing `probe?.online` reads as
// optional chaining to a regex, so writing documentation could fail a webOS
// build. Aliasing the module away here fixes both at once - the stories are
// never in the bundle to be scanned.
//
// Wired in `tvShellLegacyConfig` (shell.ts), which aliases `#tv/workbench` to
// this file. `?workbench` on a legacy TV therefore renders nothing, which is the
// honest answer: the tool is for development, on a machine with a real browser.

export function Workbench(): null {
  return null;
}
