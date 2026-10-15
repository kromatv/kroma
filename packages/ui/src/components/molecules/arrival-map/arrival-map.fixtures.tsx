import { Box } from '#ui/components/atoms/box';
import { ArrivalMap } from './arrival-map';

const SLICES = 120;

export function received(whole: number, partial = 0): number[] {
  return Array.from({ length: SLICES }, (_, slice) => {
    if (slice < whole) return 100;
    return slice < whole + partial ? 40 : 0;
  });
}

export function fetching(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, at) => from + at).filter((slice) => slice < SLICES);
}

export const ENDS_FIRST = Array.from({ length: SLICES }, (_, slice) =>
  slice < 14 || slice > 112 ? 100 : 0,
);

/** Nothing whole anywhere while the container's index is read from both ends. */
export const INDEX_READ = { slices: received(0), arriving: [0, SLICES - 1] };

export function OverFilm({
  slices,
  arriving,
  label,
}: Readonly<{ slices: readonly number[]; arriving?: readonly number[]; label?: string }>) {
  return (
    <Box bg="black" p={20} radius="xl">
      <ArrivalMap slices={slices} arriving={arriving} label={label} />
    </Box>
  );
}
