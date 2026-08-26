import type { PlayerSurface } from '../types';

/**
 * The hold the settings card can take on a video surface.
 *
 * `transform` scales the stage the surface sits in - an in-page `<video>`, a
 * `<VideoView>`, the libVLC TextureView - about the origin `stageCard` picked,
 * and carries everything drawn on the picture down with it. `plane` is a
 * hardware plane BEHIND the page, which React does not lay out at all and which
 * moves through `setPlaneRect`.
 *
 * There is no third answer. A native view React lays out takes a transform only
 * if it draws inside the view hierarchy, so a surface that would need its BOX
 * moved instead (an Android SurfaceView) is given a texture-backed one on the
 * shell side rather than a shrink of its own.
 */
export type SurfaceShrink = 'transform' | 'plane';

export function surfaceShrink(surface: PlayerSurface): SurfaceShrink {
  return surface === 'avplay' || surface === 'mpv' ? 'plane' : 'transform';
}
