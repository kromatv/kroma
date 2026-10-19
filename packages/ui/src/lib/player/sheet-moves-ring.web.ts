/** Whether the up-next sheet posts a routed direction to its navigator itself:
 * always, since the player swallows every key it routes. */
export function sheetMovesRing(_remoteEnabled: boolean): boolean {
  return true;
}
