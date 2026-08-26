// The manual grab's search sub-panel: a free-text sweep of every indexer,
// scoped by whatever the target block above it says (a season/episode there
// makes this a TV search), and the picked row pre-fills the magnet + title.

import type { ManualReleaseView } from '@kroma/module-acquisition/schemas';
import { useFormat, useT } from '@kroma/module-sdk';
import { Box, Button, Field, Focusable, Icon, Row, sv, Text } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';

// The card the result rows are flush inside, which is why it clips their focus
// ring inward (`data-focus-ring-inset`, in @kroma/ui's styles/base.css).
const RESULT_LIST: CSSProperties = {
  marginTop: 8,
  maxHeight: 176,
  overflowY: 'auto',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid color-mix(in srgb, var(--kroma-tint) 7%, transparent)',
  background: 'var(--kroma-bg)',
};

const resultRow = sv({
  base: {
    row: true,
    align: 'center',
    w: '100%',
    gap: 12,
    px: 12,
    py: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'tint/4',
    _hover: { bg: 'tint/3' },
  },
  variants: {
    last: { true: { borderBottomWidth: 0 } },
  },
  defaults: { last: false },
});

export function SearchPanel({
  query,
  scopeLabel,
  setQuery,
  searching,
  searchErr,
  results,
  onSearch,
  onPick,
}: Readonly<{
  query: string;
  /** What the sweep is narrowed to (`S03E07`), from the target block; absent
   *  for a movie search. */
  scopeLabel: string | null;
  setQuery: (v: string) => void;
  searching: boolean;
  searchErr: string | null;
  results: ManualReleaseView[] | null;
  onSearch: () => void;
  onPick: (r: ManualReleaseView) => void;
}>) {
  const t = useT();
  return (
    <Box>
      <Box row gap={8}>
        <Field.Root
          label={t('manual.search')}
          hideLabel
          flex
          value={query}
          onValueChange={setQuery}
        >
          <Field.Input
            icon="search"
            onSubmit={onSearch}
            placeholder={t('manual.searchPlaceholder')}
          />
        </Field.Root>
        <Button
          variant="primary"
          size="sm"
          label={t('manual.search')}
          onPress={onSearch}
          disabled={!query.trim()}
          loading={searching}
        />
      </Box>
      {scopeLabel ? (
        <Text variant="meta" color="info" mt={6}>
          {t('manual.searchScoped', { scope: scopeLabel })}
        </Text>
      ) : null}
      {searchErr ? (
        <Text variant="meta" color="accentText" mt={6}>
          {searchErr}
        </Text>
      ) : null}
      {results ? (
        <div style={RESULT_LIST} data-focus-ring-inset="">
          {results.length === 0 ? (
            <Box px={12} py={16}>
              <Text variant="meta" color="textDim" textAlign="center">
                {t('manual.noResults')}
              </Text>
            </Box>
          ) : (
            results.map((r, index) => (
              <ResultRow
                key={`${r.indexerName}-${r.guid}`}
                r={r}
                last={index === results.length - 1}
                onPick={() => onPick(r)}
              />
            ))
          )}
        </div>
      ) : null}
    </Box>
  );
}

function ResultRow({
  r,
  last,
  onPick,
}: Readonly<{ r: ManualReleaseView; last: boolean; onPick: () => void }>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Focusable sv={resultRow} vars={{ last }} label={r.title} onPress={onPick}>
      <Box minW={0} flex>
        <Text variant="meta" lines={1}>
          {r.title}
        </Text>
        <Row wrap gapX={10} mt={2}>
          <Text variant="meta" color="textDim">
            {r.indexerName}
          </Text>
          {r.resolution ? (
            <Text variant="meta" color="info">
              {r.resolution}
            </Text>
          ) : null}
          {r.codec ? (
            <Text variant="meta" color="hdr">
              {r.codec}
            </Text>
          ) : null}
          {r.sizeBytes != null ? (
            <Text variant="meta" color="textDim">
              {fmt.bytes(r.sizeBytes)}
            </Text>
          ) : null}
          {r.seeders != null ? (
            <Text variant="meta" color="success">
              {t('requests.seedersN', { n: String(r.seeders) })}
            </Text>
          ) : null}
          {r.detailsUrl ? (
            <Text variant="meta" color="text/30">
              · {t('downloads.hasTrackerPage')}
            </Text>
          ) : null}
        </Row>
      </Box>
      <Box shrink={0}>
        <Icon name="download" size={15} thickness={2.2} color="accent" />
      </Box>
    </Focusable>
  );
}
