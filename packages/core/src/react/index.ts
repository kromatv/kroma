// React bindings for the shared domain logic - `@kroma/core/react`. The
// domain layer (`@kroma/core`) is deliberately React-free, so headless React
// logic that every client drives the same way lives here instead, parameterized
// over a HOST adapter for the pieces that differ per app (session, client
// instance). No components or styles - that is @kroma/ui's floor.

export type {
  CheckPrompt,
  CheckPromptOptions,
  HandoffAttempt,
  HandoffOutcome,
  HandoffPicker,
  HandoffPickerOptions,
} from './handoff-picker';
export {
  HANDOFF_OUTCOME_MS,
  handoffRowHint,
  useCheckPrompt,
  useHandoffPicker,
} from './handoff-picker';
export type { LangPatch, LangPrefs, LangPrefsHost, LangPrefUser } from './lang-prefs';
export { normalizeLangPref, prefValue, useLangPrefs } from './lang-prefs';
export type { NearbyTvs } from './nearby-tvs';
export { useNearbyTvs } from './nearby-tvs';
