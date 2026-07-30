// `tvShellLegacyConfig` aliases `#tv/workbench` to this file: the legacy bundle
// is one IIFE with `inlineDynamicImports`, so the lazy workbench import would
// inline every story, and story prose like `probe?.online` reads as optional
// chaining to `check-legacy.ts`'s syntax grep.

export function Workbench(): null {
  return null;
}
