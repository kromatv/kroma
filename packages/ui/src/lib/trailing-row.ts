/** The row a grid's mounted window trails behind the focus; here it is the focus itself. */
export function useTrailingRow(focused: number, _settleMs: number): number {
  return focused;
}
