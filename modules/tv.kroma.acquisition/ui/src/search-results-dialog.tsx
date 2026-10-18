import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, Callout, Dialog, IconButton, Row, Skeleton, Text } from '@kromatv/ui/kit';
import { IndexerReportStrip } from './indexer-report';
import { ReleaseList } from './release-list';
import { ReleaseSortSelect } from './release-sort-select';
import { ReleaseTabs } from './release-tabs';
import { NO_RELEASES, useReleaseView } from './use-release-view';
import type { SearchState } from './use-search-runner';

const PLACEHOLDERS = ['a', 'b', 'c', 'd'] as const;

export function SearchResultsDialog({
  state,
  canGrab,
  onGrab,
  onClose,
  subject,
}: Readonly<{
  state: SearchState;
  canGrab: boolean;
  onGrab: (release: ScoredReleaseView) => void;
  onClose: () => void;
  /** What is being searched, « Severance · S01E03 », named in the title. */
  subject?: string;
}>) {
  const t = useT();
  const heading = subject ? t('acq.searchFor', { subject }) : t('requests.interactiveSearch');
  const view = useReleaseView(state.view?.releases ?? NO_RELEASES);
  const open = state.busy || state.view != null || state.error != null;
  return (
    <Dialog.Root open={open} onClose={onClose} width="2xl" fullHeight title={heading}>
      <Dialog.Header>
        <Row between align="center" gap={16}>
          <Text variant="title" accessibilityRole="header" lines={1} flex minW={0}>
            {heading}
          </Text>
          <IconButton control="sm" icon="x" label={t('common.close')} onPress={onClose} />
        </Row>
        {state.busy ? (
          <Text variant="meta" color="textDim">
            {t('requests.searchRunning')}
          </Text>
        ) : null}
        {state.view && !state.busy ? (
          <Row wrap between gapX={16} gapY={10} align="center" mt={4}>
            <ReleaseTabs view={view} />
            <Row wrap gap={12} align="center" shrink={1} minW={0}>
              <IndexerReportStrip indexers={state.view.indexers} />
              <ReleaseSortSelect view={view} />
            </Row>
          </Row>
        ) : null}
      </Dialog.Header>
      <Dialog.Panel>
        <Box gap={16} pb={8}>
          {state.error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{state.error}</Callout.Title>
            </Callout.Root>
          ) : null}
          {state.grabbed ? (
            <Callout.Root tone={state.grabbed.error ? 'danger' : 'success'}>
              <Callout.Title>
                {state.grabbed.error
                  ? state.grabbed.title
                  : `${t('requests.grabbed')} ${state.grabbed.title}`}
              </Callout.Title>
            </Callout.Root>
          ) : null}
          {state.busy ? (
            <Box gap={8}>
              {PLACEHOLDERS.map((key) => (
                <Skeleton key={key} h={92} radius="lg" />
              ))}
            </Box>
          ) : null}
          {!state.busy && state.view ? (
            <ReleaseList
              key={`${view.tab}:${view.sort}`}
              tab={view.tab}
              rows={view.rows}
              counts={view.counts}
              indexers={state.view.indexers}
              canGrab={canGrab}
              busy={state.grabbing}
              onGrab={onGrab}
            />
          ) : null}
        </Box>
      </Dialog.Panel>
    </Dialog.Root>
  );
}
