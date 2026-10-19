import { Platform } from 'react-native';

/** Whether pointer-only controls such as a rail's paging arrows show: never without a pointer. */
export function pointerControls(_wanted: boolean): boolean {
  return false;
}

/** Whether a scoped strip draws its edge fades: not where a finger scrolls it. */
export function keyedEdges(scoped: boolean): boolean {
  return scoped && Platform.isTV;
}
