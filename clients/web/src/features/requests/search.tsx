// The discovery page: browse trending titles or search across the local
// library + TMDB (Overseerr-style). A prominent search hero, trending rails as
// the empty state, and counted result grids. TMDB is gated on requests.create.

import { type DiscoverType, hasPermission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, Icon, InputGroup, PageHeader, SegmentGroup } from '@kroma/ui/kit';
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
    body = (
      <EmptyState.Root icon="mood-empty">
        <EmptyState.Title>{t('discover.empty')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }

  return (
    <main style={PAGE}>
      <div style={HERO}>
        <div style={WASH_CLIP}>
          <div style={WASH} />
        </div>
        <div style={ABOVE_WASH}>
          <PageHeader.Root>
            <PageHeader.Title>{t('discover.title')}</PageHeader.Title>
            <PageHeader.Subtitle>
              {canDiscover ? t('discover.subtitle') : t('discover.subtitleLocal')}
            </PageHeader.Subtitle>
          </PageHeader.Root>

          <Box row wrap align="center" gap={12} mt={24}>
            <InputGroup.Root size="md" label={t('discover.title')} style={SEARCH_BOX}>
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

      <div style={GUTTER}>{body}</div>
    </main>
  );
}

const PAGE = { minWidth: 0, paddingBottom: 80 } as const;

const GUTTER = { paddingLeft: 'var(--gutter-web)', paddingRight: 'var(--gutter-web)' } as const;

const HERO = { ...GUTTER, position: 'relative', paddingTop: 36 } as const;

const WASH_CLIP = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
} as const;

const WASH = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: -80,
  height: 288,
  background:
    'radial-gradient(48% 60% at 28% 20%, color-mix(in srgb, var(--kroma-accent-wash) 10%, transparent), transparent 70%)',
} as const;

const ABOVE_WASH = { position: 'relative' } as const;
