// A paginated grid of this week's trending movies OR shows, reached from the
// discover rails. TMDB-gated on `requests.create`.

import { hasPermission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, EmptyState } from '@kroma/ui/kit';
import { IconArrowLeft, IconFlame } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { DiscoverCard } from '#web/features/requests/discover-card';
import {
  type TrendingPageState,
  useTrendingPage,
} from '#web/features/requests/use-discover-search';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_MAIN, PAGE_TITLE, SkeletonRow } from '#web/shared/ui';

// Same auto-fill poster grid as the catalogue (see cards.tsx GRID).
const GRID =
  'mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(var(--card-w),100%),1fr))] gap-x-4.5 gap-y-6 *:w-full!';

export function TrendingPage({ type }: Readonly<{ type: 'movie' | 'tv' }>) {
  const t = useT();
  const { user } = useAuth();
  const canDiscover = !!user && hasPermission(user, 'requests.create');
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLElement>(null);
  const state = useTrendingPage(type, page, canDiscover);
  const title = type === 'movie' ? t('discover.trendingMovies') : t('discover.trendingShows');

  // Paging is the only page-change path, so the scroll-to-top belongs here
  // rather than in an effect.
  const go = (next: number) => {
    setPage(Math.min(Math.max(1, next), state.totalPages));
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <main ref={topRef} className={PAGE_MAIN}>
      <Link
        to="/search"
        className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-dim transition-colors hover:text-text"
      >
        <IconArrowLeft size={16} stroke={2.2} />
        {t('discover.back')}
      </Link>

      <h1 className={`flex items-center gap-2.5 ${PAGE_TITLE}`}>
        <IconFlame size={26} stroke={2} className="text-accent" />
        {title}
      </h1>

      {!canDiscover ? (
        <EmptyState icon="mood-empty" title={t('discover.empty')} />
      ) : (
        <>
          <Body state={state} />
          {/* totalPages is retained while the next page loads. */}
          <Pager page={page} totalPages={state.totalPages} onGo={go} />
        </>
      )}
    </main>
  );
}

function Body({ state }: Readonly<{ state: TrendingPageState }>) {
  const t = useT();
  if (state.loading) {
    return (
      <div className="mt-8">
        <SkeletonRow count={12} />
      </div>
    );
  }
  if (state.entries.length === 0) {
    return <EmptyState icon="mood-empty" title={t('discover.noResults')} />;
  }
  return (
    <div className={GRID}>
      {state.entries.map((entry) => (
        <DiscoverCard key={`${entry.kind}-${entry.tmdbId}`} entry={entry} />
      ))}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  onGo,
}: Readonly<{ page: number; totalPages: number; onGo: (n: number) => void }>) {
  const t = useT();
  if (totalPages <= 1) return null;
  return (
    <div className="mt-10 flex items-center justify-center gap-4">
      <Button
        variant="glass"
        size="sm"
        icon="chevron-left"
        label={t('discover.prev')}
        onPress={() => onGo(page - 1)}
        disabled={page <= 1}
      />
      <span className="text-[13.5px] font-semibold tabular-nums text-dim">
        {t('discover.pageOf', { page: String(page), total: String(totalPages) })}
      </span>
      <Button
        variant="glass"
        size="sm"
        iconRight="chevron-right"
        label={t('discover.next')}
        onPress={() => onGo(page + 1)}
        disabled={page >= totalPages}
      />
    </div>
  );
}
