// Catalogue-specific loading placeholders, shaped like the layouts they stand
// in for. The pulsing primitives come from @kroma/ui/kit; the wrappers here
// only reproduce the pages' own grids and gutters.

import { PosterSkeleton, Skeleton } from '@kroma/ui/kit';

export { CardSkeleton, Skeleton, TableSkeleton } from '@kroma/ui/kit';

// The web tiles are sized by `--card-w`, a fluid CSS variable no React Native
// prop can carry, so the cell states the width and the kit tile fills it.
function PosterCell() {
  return (
    <div style={{ width: 'var(--card-w)' }} className="shrink-0">
      <PosterSkeleton />
    </div>
  );
}

/** Mirrors the pages' auto-fill grid (cards.tsx) so tiles line up. */
export function SkeletonRow({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(var(--card-w),100%),1fr))] gap-x-4.5 gap-y-6 *:w-full!">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder grid
        <PosterCell key={i} />
      ))}
    </div>
  );
}

export function RailSkeleton({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <section>
      <Skeleton h={24} w={208} mt={40} mb={20} />
      <div className="flex gap-[18px] overflow-hidden py-4">
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rail
          <PosterCell key={i} />
        ))}
      </div>
    </section>
  );
}

export function PageSkeleton({ rails = 3 }: Readonly<{ rails?: number }>) {
  return (
    <main className="min-w-0 px-(--gutter-web) pb-20 pt-9">
      <div className="h-[46vh] min-h-80 w-full">
        <Skeleton h="100%" w="100%" radius={16} />
      </div>
      {Array.from({ length: rails }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rails
        <RailSkeleton key={i} />
      ))}
    </main>
  );
}

export function DetailSkeleton() {
  return (
    <main className="pb-16">
      <div className="relative h-[56vh] min-h-96 w-full overflow-hidden">
        <Skeleton h="100%" w="100%" radius={0} />
      </div>
      <div className="px-(--gutter-web)">
        <Skeleton h={40} w="40%" mt={-96} />
        <div className="mt-4 flex gap-3">
          <Skeleton h={24} w={64} />
          <Skeleton h={24} w={64} />
          <Skeleton h={24} w={96} />
        </div>
        <div className="mt-6 max-w-2xl">
          <Skeleton shape="text" lines={3} />
        </div>
        <div className="mt-8 flex gap-3">
          <Skeleton h={48} w={144} radius="lg" />
          <Skeleton h={48} w={48} radius="lg" />
        </div>
        <RailSkeleton count={6} />
      </div>
    </main>
  );
}
