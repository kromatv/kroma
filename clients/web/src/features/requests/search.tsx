// The discovery page: browse trending titles or search across the local
// library + TMDB (Overseerr-style). A prominent search hero, trending rails as
// the empty state, and counted result grids. TMDB is gated on requests.create.

import { hasPermission } from '@kroma/client/accounts';
import type { DiscoverType } from '@kroma/client/discovery';
import { useT } from '@kroma/ui';
import {
  Box,
  classes,
  EmptyState,
  Icon,
  InputGroup,
  PageHeader,
  SegmentGroup,
  styles,
} from '@kroma/ui/kit';
import type { ReactNode } from 'react';
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

const GUTTER = { paddingLeft: 'var(--gutter-web)', paddingRight: 'var(--gutter-web)' } as const;

const s = styles({
  searchBox: { width: '100%', maxWidth: 672 },
  page: { minWidth: 0, pb: 80 },
  gutter: GUTTER,
  hero: { ...GUTTER, position: 'relative', pt: 36 },
  washClip: { fill: true, overflow: 'hidden', pointerEvents: 'none' },
  wash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -80,
    height: 288,
    backgroundImage:
      'radial-gradient(48% 60% at 28% 20%, color-mix(in srgb, var(--kroma-accent-wash) 10%, transparent), transparent 70%)',
  },
  aboveWash: { position: 'relative' },
});

export type DiscoverSearch = { q: string; type: DiscoverType };

export function validateDiscoverSearch(s: Record<string, unknown>): DiscoverSearch {
  const q = typeof s.q === 'string' ? s.q : '';
  const rawType = typeof s.type === 'string' ? s.type : 'all';
  const type: DiscoverType = rawType === 'movie' || rawType === 'tv' ? rawType : 'all';
  return { q, type };
}

export function SearchPage({
  query,
  type,
  setQuery,
  setType,
}: Readonly<{
  query: string;
  type: DiscoverType;
  setQuery: (q: string) => void;
  setType: (t: DiscoverType) => void;
}>) {
  const t = useT();
  const { user } = useAuth();
  const canDiscover = !!user && hasPermission(user, 'requests.create');
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
    body = (
      <EmptyState.Root icon="mood-empty">
        <EmptyState.Title>{t('discover.empty')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }

  return (
    <main className={classes(s.page)}>
      <div className={classes(s.hero)}>
        <div className={classes(s.washClip)}>
          <div className={classes(s.wash)} />
        </div>
        <div className={classes(s.aboveWash)}>
          <PageHeader.Root>
            <PageHeader.Title>{t('discover.title')}</PageHeader.Title>
            <PageHeader.Subtitle>
              {canDiscover ? t('discover.subtitle') : t('discover.subtitleLocal')}
            </PageHeader.Subtitle>
          </PageHeader.Root>

          <Box row wrap align="center" gap={12} mt={24}>
            <InputGroup.Root size="md" label={t('discover.title')} style={s.searchBox}>
              <InputGroup.Addon>
                <Icon name="search" size={20} color="textDim" />
              </InputGroup.Addon>
              <InputGroup.Input
                type="search"
                value={query}
                onValueChange={setQuery}
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
              <SegmentGroup.Root
                size="md"
                label={t('discover.title')}
                value={type}
                onValueChange={setType}
              >
                {TYPES.map((tp) => (
                  <SegmentGroup.Item key={tp.value} value={tp.value}>
                    <SegmentGroup.Label>{t(tp.labelKey)}</SegmentGroup.Label>
                  </SegmentGroup.Item>
                ))}
              </SegmentGroup.Root>
            ) : null}
          </Box>
        </div>
      </div>

      <div className={classes(s.gutter)}>{body}</div>
    </main>
  );
}
