// Catalogue-specific loading placeholders, shaped like the layouts they stand
// in for. The base primitives come from @kroma/admin-kit.

import { Skeleton } from '@kroma/admin-kit';

export { CardSkeleton, Skeleton, TableSkeleton } from '@kroma/admin-kit';

export function SkeletonText({
  lines = 3,
  className = '',
}: Readonly<{ lines?: number; className?: string }>) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder row
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function PosterSkeleton({ width }: Readonly<{ width?: number }>) {
  return (
    <div style={{ width: width ?? 'var(--card-w)' }} className="shrink-0">
      <Skeleton className="aspect-2/3 w-full rounded-lg" />
      <Skeleton className="mt-2.5 h-3.5 w-3/4" />
      <Skeleton className="mt-1.5 h-3 w-1/3 bg-white/4" />
    </div>
  );
}

/** Mirrors the pages' auto-fill grid (cards.tsx) so tiles line up. */
export function SkeletonRow({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(var(--card-w),100%),1fr))] gap-x-4.5 gap-y-6 *:w-full!">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder grid
        <PosterSkeleton key={i} />
      ))}
    </div>
  );
}

export function RailSkeleton({ count = 7 }: Readonly<{ count?: number }>) {
  return (
    <section>
      <Skeleton className="mb-5 mt-10 h-6 w-52" />
      <div className="flex gap-[18px] overflow-hidden py-4">
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rail
          <PosterSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function PageSkeleton({ rails = 3 }: Readonly<{ rails?: number }>) {
  return (
    <main className="min-w-0 px-(--gutter-web) pb-20 pt-9">
      <Skeleton className="h-[46vh] min-h-80 w-full rounded-2xl" />
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
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <div className="px-(--gutter-web)">
        <Skeleton className="-mt-24 h-10 w-2/5" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <SkeletonText className="mt-6 max-w-2xl" lines={3} />
        <div className="mt-8 flex gap-3">
          <Skeleton className="h-12 w-36 rounded-xl" />
          <Skeleton className="h-12 w-12 rounded-xl" />
        </div>
        <RailSkeleton count={6} />
      </div>
    </main>
  );
}
