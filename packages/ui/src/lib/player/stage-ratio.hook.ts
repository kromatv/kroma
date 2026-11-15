/** The stage's width / height. A native shell IS the screen it draws on, so what
 * the chrome measured of the window already is the stage's own shape. See the
 * `.web` half for why a browser cannot assume that. */
export function useStageRatio(_stageId: string, measured: number): number {
  return measured;
}
