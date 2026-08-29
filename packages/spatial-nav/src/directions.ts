export const Directions = {
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  ENTER: 'enter',
} as const;

export type Direction = (typeof Directions)[keyof typeof Directions];

export type Orientation = 'horizontal' | 'vertical';

export interface Move {
  readonly orientation: Orientation;
  readonly forward: boolean;
}

const MOVES: Record<Exclude<Direction, 'enter'>, Move> = {
  left: { orientation: 'horizontal', forward: false },
  right: { orientation: 'horizontal', forward: true },
  up: { orientation: 'vertical', forward: false },
  down: { orientation: 'vertical', forward: true },
};

/** The axis and the sense a direction walks a container in; null for `enter`,
 *  which moves nothing. */
export function moveOf(direction: Direction): Move | null {
  return direction === Directions.ENTER ? null : MOVES[direction];
}
