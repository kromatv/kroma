import { KROMA, type Theme } from '#ui/core/theme-create';
import {
  CIRCLE_RADIUS,
  type CornerValue,
  type Radius,
  type RadiusToken,
} from '#ui/core/tokens/layout';

export function radiusValue(corner: CornerValue, side?: number, theme: Theme = KROMA): Radius {
  if (typeof corner === 'number') return corner;
  if (corner === 'circle') return side === undefined ? CIRCLE_RADIUS : side / 2;
  const isToken = (value: string): value is RadiusToken => value in theme.radius;
  return isToken(corner) ? theme.radius[corner] : corner;
}
export function scaledRadius(corner: CornerValue, factor: number, theme: Theme = KROMA): Radius {
  const value = radiusValue(corner, undefined, theme);
  if (typeof value === 'number') return Math.round(value * factor);
  return factor === 1 ? value : `calc(${value} * ${factor})`;
}
