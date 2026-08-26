// Where an anchored surface puts what it holds: hanging off its trigger, or in
// a dialog over the screen. The shell states it once at startup, because both
// answers are real on every target.

import { useInsideFocusScope } from '#ui/lib/focus-presence';

/**
 * Where an anchored surface's content appears: `panel` hangs it off the
 * trigger, `dialog` puts it over the screen, and `auto` asks the platform - a
 * dialog under a D-pad, a panel under a pointer.
 */
type SurfacePresentation = 'auto' | 'panel' | 'dialog';

type ResolvedPresentation = Exclude<SurfacePresentation, 'auto'>;

let shellPresentation: SurfacePresentation = 'auto';

/** The shell's answer for every anchored surface in it. Call once at startup;
 *  a surface's own `presentation` still wins, and `auto` hands the question
 *  back to the platform. */
function setSurfacePresentation(presentation: SurfacePresentation): void {
  shellPresentation = presentation;
}

/** Resolves one surface: what it was asked for, else what the shell said, else
 *  the platform - a dialog inside a <FocusScope>, where a D-pad drives, and a
 *  panel outside one. */
function useSurfacePresentation(asked: SurfacePresentation = 'auto'): ResolvedPresentation {
  const scoped = useInsideFocusScope();
  const stated = asked === 'auto' ? shellPresentation : asked;
  if (stated !== 'auto') return stated;
  return scoped ? 'dialog' : 'panel';
}

export type { ResolvedPresentation, SurfacePresentation };
export { setSurfacePresentation, useSurfacePresentation };
