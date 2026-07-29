// The discovery page: browse trending titles or search across the local
// library + TMDB (Overseerr-style). A prominent search hero, trending rails as
// the empty state, and counted result grids. TMDB is gated on requests.create.

import { type DiscoverType, hasPermission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Chip, EmptyState, IconButton } from '@kroma/ui/kit';
import { IconSearch } from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { SearchResults } from '#web/features/requests/search-results';
import { TrendingBrowse } from '#web/features/requests/trending';
import { useDiscoverSearch, useTrending } from '#web/features/requests/use-discover-search';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_SUBTITLE, PAGE_TITLE } from '#web/shared/ui';

const TYPES: {
  value: DiscoverType;
  labelKey: 'discover.all' | 'discover.movies' | 'discover.shows';
}[] = [
  { value: 'all', labelKey: 'discover.all' },
  { value: 'movie', labelKey: 'discover.movies' },
  { value: 'tv', labelKey: 'discover.shows' },
];

export function SearchPage() {
  const t = useT();
  const { user } = useAuth();
  const canDiscover = !!user && hasPermission(user, 'requests.create');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<DiscoverType>('all');
  const state = useDiscoverSearch(query, type);
  const trending = useTrending(canDiscover);
  const searching = query.trim().length > 0;

  // Page body: search results while searching, else the trending browse (when
  // discovery is available) or a local-only empty state.
  let body: ReactNode;
  if (searching) {
    body = <SearchResults state={state} />;
  } else if (canDiscover) {
    body = <TrendingBrowse entries={trending.entries} loading={trending.loading} type={type} />;
  } else {
    body = <EmptyState icon="mood-empty" title={t('discover.empty')} />;
  }

  return (
    <main className="min-w-0 pb-20">
      {/* discovery hero: title + prominent search + type filter */}
      <div className="relative overflow-hidden px-(--gutter-web) pt-9">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-72 bg-[radial-gradient(48%_60%_at_28%_20%,rgba(242,180,66,.10),transparent_70%)]" />
        <div className="relative">
          <h1 className={PAGE_TITLE}>{t('discover.title')}</h1>
          <p className={PAGE_SUBTITLE}>
            {canDiscover ? t('discover.subtitle') : t('discover.subtitleLocal')}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="group/search relative flex h-14 w-full max-w-2xl items-center rounded-2xl border border-border-strong bg-surface-1 px-4 shadow-card transition-colors">
              <IconSearch
                size={20}
                className="shrink-0 text-dim transition-colors group-focus-within/search:text-accent"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('discover.placeholder')}
                // biome-ignore lint/a11y/noAutofocus: discovery is a search-first page
                autoFocus
                // The bordered label above is the field; it takes the ring.
                data-focus-ring="off"
                className="min-w-0 flex-1 bg-transparent px-3.5 text-[16px] font-semibold text-text outline-none placeholder:font-medium placeholder:text-dim"
              />
              {query ? (
                <IconButton
                  variant="ghost"
                  size={28}
                  glyph={18}
                  icon="x"
                  onPress={() => setQuery('')}
                />
              ) : null}
            </label>

            {canDiscover ? (
              <div className="flex gap-1.5">
                {TYPES.map((tp) => (
                  <Chip
                    key={tp.value}
                    active={type === tp.value}
                    variant="subtle"
                    label={t(tp.labelKey)}
                    onPress={() => setType(tp.value)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-(--gutter-web)">{body}</div>
    </main>
  );
}
