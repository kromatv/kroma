import type { Progress } from '#site/lib/views';

/** How far along a language is: `percent` is floored, so only a finished language reads 100%. */
export function completion({ done, total }: Progress): {
  ratio: number;
  percent: number;
  complete: boolean;
} {
  if (total <= 0) {
    return { ratio: 1, percent: 100, complete: true };
  }
  const ratio = done / total;
  return { ratio, percent: Math.floor(ratio * 100), complete: done >= total };
}
