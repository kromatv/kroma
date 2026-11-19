import { useCast } from './cast-context';
import { useLivePosition } from './live-position.hook';

/** The driven television's playhead, in ms, for a view that draws it: smooth
 * between two reports, and where a seek was sent the moment it is sent. */
export function useCastPosition(): number {
  const { active, position } = useCast();
  return useLivePosition({ position, durationMs: active?.nowPlaying?.durationMs ?? 0 });
}
