import type { RemoteKey } from '@kroma/core';
import type { PlayerFlags } from '../types';

/**
 * The unified input model. ONE navigation contract drives both the D-pad (TV
 * remote) and the mouse (hover = focus, click = OK), so every control responds
 * to both without per-platform branches (§15). Logical keys come from
 * `@kroma/core` `resolveRemoteKey`, shared with the rest of the TV shell.
 */
export type { RemoteKey } from '@kroma/core';

/** The vertical zones the player is split into (§3). The bottom "À suivre" zone
 * is the {@link Overlay} `sheet`, opened by ▼ from the controls (never on hover). */
export type Zone = 'progress' | 'controls';

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
  | 'pip'
  | 'fullscreen';

/** Build the present control row from the flags + whether there's a next episode.
 * Absent controls leave no gap and no trapped D-pad stop. */
export function controlOrder(flags: PlayerFlags, hasNext: boolean): ControlId[] {
  const row: ControlId[] = ['rewind', 'play', 'forward'];
  if (hasNext) row.push('next');
  if (flags.volume) row.push('volume');
  row.push('subtitles', 'audio', 'settings');
  if (flags.pip) row.push('pip');
  if (flags.fullscreen) row.push('fullscreen');
  return row;
}

/**
 * Imperative handle an open panel exposes so the player shell can route D-pad
 * keys into it (useImperativeHandle). `onKey` returns true when the panel
 * consumed the key (so the shell stops), false to let the shell handle it (e.g.
 * an unhandled Back bubbles up to close the panel).
 */
export interface PanelHandle {
  onKey(key: RemoteKey): boolean;
}
