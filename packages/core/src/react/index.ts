// React bindings for the shared domain logic - `@kromatv/core/react`. The
// domain layer (`@kromatv/core`) is deliberately React-free, so headless React
// logic that every client drives the same way lives here instead, parameterized
// over a HOST adapter for the pieces that differ per app (session, client
// instance). No components or styles - that is @kromatv/ui's floor.

export type { ArrivalRecoveryOptions, ArrivalRecoveryPlayer } from './arrival-recovery';
export { useArrivalRecovery } from './arrival-recovery';
export { useArrivalStall } from './arrival-stall';
export type { AskedTitle, TitleAsk } from './ask-for-title';
export { useAskForTitle } from './ask-for-title';
export { useCapability } from './capability';
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
export { useLoadedSheet } from './loaded-sheet';
export type { NearbyTvs } from './nearby-tvs';
export { useNearbyTvs } from './nearby-tvs';
export type { HeldSeekTransport } from './seek-hold';
export { useHeldSeek } from './seek-hold';
export type { WatchFollowingOptions, WatchGuideReader } from './watch-following';
export { useWatchFollowing } from './watch-following';
export type { WatchScreen, WatchScreenOptions } from './watch-screen';
export { useWatchScreen } from './watch-screen';
export type { WatchSources } from './watch-source';
export { useWatchSources } from './watch-source';
export type { WatchStoryboardOptions } from './watch-storyboard';
export { useWatchStoryboard } from './watch-storyboard';
export { useWatchSubject } from './watch-subject';
export type {
  WatchSubtitles,
  WatchSubtitlesOptions,
  WatchSubtitleTrack,
} from './watch-subtitles';
export { useWatchSubtitles } from './watch-subtitles';
