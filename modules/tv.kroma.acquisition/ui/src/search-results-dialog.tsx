import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Dialog, Row, TableSkeleton, Text } from '@kromatv/ui/kit';
import { IndexerReportStrip } from './indexer-report';
import { NO_RELEASES, ReleaseFilters } from './release-filters';
import { ReleaseTable } from './release-table';
import { useReleaseView } from './use-release-view';
import type { SearchState } from './use-search-runner';

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
    <Dialog.Root open={open} onClose={onClose} width="2xl" title={heading}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {heading}
        </Text>
        <Text variant="meta" color="textDim">
          {t(state.busy ? 'requests.searchRunning' : 'requests.searchAnswered')}
        </Text>
        {state.view ? (
          <Row wrap between gap={12} align="center" mt={4}>
            <ReleaseFilters view={view} />
            <IndexerReportStrip indexers={state.view.indexers} />
          </Row>
        ) : null}
      </Dialog.Header>
      <Dialog.Panel>
        <Box gap={12}>
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
          {state.busy ? <TableSkeleton rows={6} /> : null}
          {!state.busy && state.view ? (
            <ReleaseTable
              view={view}
              indexers={state.view.indexers}
              report={false}
              canGrab={canGrab}
              busy={state.grabbing}
              onGrab={onGrab}
            />
          ) : null}
        </Box>
      </Dialog.Panel>
      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.close')} onPress={onClose} />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}
