/** Whether the up-next sheet posts a routed direction to its navigator itself:
 * not when a configured remote already delivers it there. */
export function sheetMovesRing(remoteEnabled: boolean): boolean {
  return !remoteEnabled;
}
