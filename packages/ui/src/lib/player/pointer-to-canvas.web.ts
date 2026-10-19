/** A pointer's `locationX` on a track, in the track's canvas units. A browser
 * hands it out in screen pixels, so it is rescaled by the track's on-screen
 * width; an unmeasured track (0) counts as unscaled. */
export function pointerToCanvas(locationX: number, onScreen: number, inCanvas: number): number {
  return (locationX / (onScreen || inCanvas)) * inCanvas;
}
