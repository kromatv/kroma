// The discovery page: browse trending titles or search across the local
// library + TMDB (Overseerr-style). A prominent search hero, trending rails as
// the empty state, and counted result grids. TMDB is gated on requests.create.

import { type DiscoverType, hasPermission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, Icon, InputGroup, PageHeader, SegmentedControl } from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import { SearchResults } from '#web/features/requests/search-results';
import { TrendingBrowse } from '#web/features/requests/trending';
import { useDiscoverSearch, useTrending } from '#web/features/requests/use-discover-search';
import { useAuth } from '#web/shared/lib/auth';

const TYPES: {
  value: DiscoverType;
  labelKey: 'discover.all' | 'discover.movies' | 'discover.shows';
}[] = [
  { value: 'all', labelKey: 'discover.all' },
  { value: 'movie', labelKey: 'discover.movies' },
  { value: 'tv', labelKey: 'discover.shows' },
];

const SEARCH_BOX = { width: '100%', maxWidth: 672 } as const;

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
    body = <EmptyState.Root icon="mood-empty" title={t('discover.empty')} />;
  }

  return (
    <main className="min-w-0 pb-20">
      <div className="relative px-(--gutter-web) pt-9">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 -top-20 h-72 bg-[radial-gradient(48%_60%_at_28%_20%,color-mix(in_srgb,var(--kroma-accent-wash)_10%,transparent),transparent_70%)]" />
        </div>
        <div className="relative">
          <PageHeader.Root
            title={t('discover.title')}
            subtitle={canDiscover ? t('discover.subtitle') : t('discover.subtitleLocal')}
          />

          <Box row wrap align="center" gap={12} mt={24}>
            <InputGroup.Root size="md" label={t('discover.title')} style={SEARCH_BOX}>
              <InputGroup.Addon>
                <Icon name="search" size={20} color="textDim" />
              </InputGroup.Addon>
              <InputGroup.Input
                type="search"
                value={query}
                onChange={setQuery}
                placeholder={t('discover.placeholder')}
              />
              {query ? (
                <InputGroup.Addon align="inline-end">
                  <InputGroup.IconButton
                    icon="x"
                    label={t('common.clear')}
                    onPress={() => setQuery('')}
                  />
                </InputGroup.Addon>
              ) : null}
            </InputGroup.Root>

            {canDiscover ? (
              <SegmentedControl.Root
                size="md"
                label={t('discover.title')}
                value={type}
                onValueChange={setType}
                options={TYPES.map((tp) => ({ value: tp.value, label: t(tp.labelKey) }))}
              />
            ) : null}
          </Box>
        </div>
      </div>

      <div className="px-(--gutter-web)">{body}</div>
    </main>
  );
}
