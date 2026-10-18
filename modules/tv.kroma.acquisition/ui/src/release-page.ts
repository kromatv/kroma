/** How many cards a group shows before anyone asks for more. */
export const FIRST_PAGE = 10;
/** How many more cards each press of the more button adds. */
export const MORE_PAGE = 20;

/** The first `shown` rows, and what the next press would add out of what is
 *  left. */
export function pageOf<Row>(
  rows: readonly Row[],
  shown: number,
): { visible: Row[]; next: number; rest: number } {
  const visible = rows.slice(0, shown);
  const rest = rows.length - visible.length;
  return { visible, next: Math.min(MORE_PAGE, rest), rest };
}
