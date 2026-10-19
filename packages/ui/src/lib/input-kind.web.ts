/** Whether pointer-only controls such as a rail's paging arrows show: never without a pointer. */
export function pointerControls(wanted: boolean): boolean {
  return wanted;
}

/** Whether a scoped strip draws its edge fades: not where a finger scrolls it. */
export function keyedEdges(scoped: boolean): boolean {
  return scoped;
}
