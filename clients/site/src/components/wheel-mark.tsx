import { WHEEL_COLORS } from '@kroma/ui/tokens';

// The chromatic wheel, the "O" of the KROMA lockup, lifted from the official
// mark (.github/assets/logo.svg) and recentred to a 100×100 box so it stands on
// its own. Six donut segments, coloured from the WHEEL_COLORS token so the mark
// can never drift from the app's. The paths are authored around centre (209,50);
// the group shifts that to (50,50).
const SEGMENTS = [
  'M209 32.96 L209 0 A50 50 0 0 1 252.3 25 L223.76 41.48 A17.045 17.045 0 0 0 209 32.96 Z',
  'M223.76 41.48 L252.3 25 A50 50 0 0 1 252.3 75 L223.76 58.52 A17.045 17.045 0 0 0 223.76 41.48 Z',
  'M223.76 58.52 L252.3 75 A50 50 0 0 1 209 100 L209 67.05 A17.045 17.045 0 0 0 223.76 58.52 Z',
  'M209 67.05 L209 100 A50 50 0 0 1 165.7 75 L194.24 58.52 A17.045 17.045 0 0 0 209 67.05 Z',
  'M194.24 58.52 L165.7 75 A50 50 0 0 1 165.7 25 L194.24 41.48 A17.045 17.045 0 0 0 194.24 58.52 Z',
  'M194.24 41.48 L165.7 25 A50 50 0 0 1 209 0 L209 32.96 A17.045 17.045 0 0 0 194.24 41.48 Z',
] as const;

export interface WheelMarkProps {
  size?: number;
  className?: string;
  spin?: boolean;
}

export function WheelMark({ size = 40, className, spin = false }: Readonly<WheelMarkProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="KROMA"
      className={[spin ? 'origin-center motion-safe:animate-wheel-spin' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <g transform="translate(-159 0)">
        {SEGMENTS.map((d, i) => (
          <path key={d} d={d} fill={WHEEL_COLORS[i]} />
        ))}
      </g>
    </svg>
  );
}
