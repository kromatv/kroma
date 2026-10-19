/** A pointer's `locationX` on a track, in the track's canvas units. React Native's
 * hit test undoes the ancestor transforms first, so the offset already arrives in
 * canvas units: rescaling it doubled every offset on a 1920-into-960 stage. */
export function pointerToCanvas(locationX: number, _onScreen: number, _inCanvas: number): number {
  return locationX;
}
