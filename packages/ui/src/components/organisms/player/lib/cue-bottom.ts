const REST = '9%';

export function cueBottom(clearance: number): number | `${number}%` {
  return clearance > 0 ? clearance : REST;
}
