// React bindings for the shared domain logic - `@kroma/core/react`.
//
// The domain layer (`@kroma/core`) is deliberately React-free: a Rust-adjacent
// pile of pure functions any runtime can call. But the CLIENTS repeat more
// than pure functions - the same hook, written once per app, drifting a line
// at a time - and that repetition is what this entry point exists to end.
//
// The rule for what belongs here: headless React logic that every client
// drives the same way, parameterized over a HOST adapter for the pieces that
// genuinely differ per app (its session provider, its client instance). No
// components, no styles - that is @kroma/ui's floor - and nothing that only
// one client wants, which stays in that client.

export type { LangPatch, LangPrefs, LangPrefsHost, LangPrefUser } from './lang-prefs';
export { normalizeLangPref, prefValue, useLangPrefs } from './lang-prefs';
