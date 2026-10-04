export const Directions = {
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  ENTER: 'enter',
  RELEASE: 'release',
  HOLD: 'hold',
} as const;

export type Direction = (typeof Directions)[keyof typeof Directions];

export type Orientation = 'horizontal' | 'vertical';

export interface Move {
  readonly orientation: Orientation;
  readonly forward: boolean;
}

type Press = 'enter' | 'release' | 'hold';

const MOVES: Record<Exclude<Direction, Press>, Move> = {
  left: { orientation: 'horizontal', forward: false },
  right: { orientation: 'horizontal', forward: true },
  up: { orientation: 'vertical', forward: false },
  down: { orientation: 'vertical', forward: true },
};

/** The axis and the sense a direction walks a container in; null for the
 *  three halves of a press, which move nothing. */
export function moveOf(direction: Direction): Move | null {
  if (direction === 'enter' || direction === 'release' || direction === 'hold') return null;
  return MOVES[direction];
}
