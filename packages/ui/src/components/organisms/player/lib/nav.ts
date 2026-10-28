import type { PlayerFlags } from '#ui/components/organisms/player/types';
import type { RemoteKey } from '#ui/lib/remote-keys';

/**
 * The unified input model. ONE navigation contract drives both the D-pad (TV
 * remote) and the mouse (hover = focus, click = OK), so every control responds
 * to both without per-platform branches (§15). Logical keys come from
 * `resolveRemoteKey`, shared with the rest of the TV shell.
 */
export type { RemoteKey } from '#ui/lib/remote-keys';

/** Where in the chrome the navigator's focus is: the top bar's Back button, the
 * seek bar, the skip-intro pill, or one of the row's controls. The bottom
 * "À suivre" sheet is the {@link Overlay} `sheet`, opened by ▼ from the row. */
export type Spot = 'back' | 'progress' | 'skip' | ControlId;

/** An open panel that captures navigation until dismissed. */
export type Overlay = 'settings' | 'audio' | 'subtitles' | 'sheet' | null;

/**
 * Every focusable control in the middle row, in visual order. The cluster stops
 * (`volume`, `pip`, `fullscreen`) are gated by feature flags a disabled flag
 * removes the control AND its focus stop (§4c), computed by {@link controlOrder}.
 */
export type ControlId =
  | 'rewind'
  | 'play'
  | 'forward'
  | 'next'
  | 'volume'
  | 'subtitles'
  | 'audio'
  | 'settings'
  | 'cast'
  | 'pip'
  | 'fullscreen';

/** Build the present control row from the flags + whether there's a next episode.
 * Absent controls leave no gap and no trapped D-pad stop. */
export function controlOrder(flags: PlayerFlags, hasNext: boolean): ControlId[] {
  const row: ControlId[] = ['rewind', 'play', 'forward'];
  if (hasNext) row.push('next');
  if (flags.volume) row.push('volume');
  row.push('subtitles', 'audio', 'settings');
  // Right after settings, left of the window controls: casting is about the
  // film, pip and fullscreen are about this window.
  if (flags.cast) row.push('cast');
  if (flags.pip) row.push('pip');
  if (flags.fullscreen) row.push('fullscreen');
  return row;
}

/**
 * Imperative handle an open panel exposes so the player shell can give it Back
 * first: `onKey` returns true when the panel took the press (a sub-view stepping
 * up to its menu), false to let the shell close the panel.
 */
export interface PanelHandle {
  onKey(key: RemoteKey): boolean;
}
