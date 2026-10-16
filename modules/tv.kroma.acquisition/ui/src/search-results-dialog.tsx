import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Dialog, TableSkeleton, Text } from '@kromatv/ui/kit';
import { ReleaseTable } from './release-table';
import type { SearchState } from './use-search-runner';

export function SearchResultsDialog({
  state,
  canGrab,
  onGrab,
  onClose,
}: Readonly<{
  state: SearchState;
  canGrab: boolean;
  onGrab: (release: ScoredReleaseView) => void;
  onClose: () => void;
}>) {
  const t = useT();
  const open = state.busy || state.view != null || state.error != null;
  return (
    <Dialog.Root open={open} onClose={onClose} width="xl" title={t('requests.interactiveSearch')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('requests.interactiveSearch')}
        </Text>
        <Text variant="meta" color="textDim">
          {t(state.busy ? 'requests.searchRunning' : 'requests.searchAnswered')}
        </Text>
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
              releases={state.view.releases}
              indexers={state.view.indexers}
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
