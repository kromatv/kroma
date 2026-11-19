import type { Importer, ImporterList } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, EmptyState, ListRow, Skeleton } from '@kromatv/ui/kit';
import { useImportSession } from '#web/features/setup/import-session.component';
import { ImporterIcon } from '#web/features/setup/importer-icon.component';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useImporters } from '#web/features/setup/use-importers.hook';

const LOADING_ROWS = ['first', 'second'];

interface SourceProps {
  onBack: () => void;
  onSkip: () => void;
}

function Loading() {
  return (
    <Box gap={8}>
      {LOADING_ROWS.map((row) => (
        <Skeleton key={row} w="100%" h={84} radius="lg" />
      ))}
    </Box>
  );
}

function ImporterRow({ importer, onPick }: Readonly<{ importer: Importer; onPick: () => void }>) {
  const t = useT();
  return (
    <ListRow.Root size="md" ground="surface" onPress={onPick}>
      <ListRow.Leading>
        <ImporterIcon importer={importer} />
      </ListRow.Leading>
      <ListRow.Label>{importer.label ?? importer.name}</ListRow.Label>
      {importer.installed ? null : <ListRow.Hint>{t('setup.importInstalls')}</ListRow.Hint>}
    </ListRow.Root>
  );
}

function NoSource() {
  const t = useT();
  return (
    <Box flex justify="center">
      <EmptyState.Root size="md" icon="plug-connected-x">
        <EmptyState.Title>{t('setup.importNoneTitle')}</EmptyState.Title>
        <EmptyState.Hint>{t('setup.importNone')}</EmptyState.Hint>
      </EmptyState.Root>
    </Box>
  );
}

function RegistryDown({ error }: Readonly<{ error: string | undefined }>) {
  const t = useT();
  if (!error) {
    return null;
  }
  return (
    <Callout.Root tone="neutral" icon="alert-triangle" size="sm">
      <Callout.Title>{t('setup.importRegistryDown')}</Callout.Title>
      <Callout.Detail>{error}</Callout.Detail>
    </Callout.Root>
  );
}

function Sources({ list }: Readonly<{ list: ImporterList }>) {
  const { update } = useImportSession();
  if (list.importers.length === 0) {
    return (
      <>
        <NoSource />
        <RegistryDown error={list.registryError} />
      </>
    );
  }
  return (
    <>
      <Box gap={8}>
        {list.importers.map((importer) => (
          <ImporterRow
            key={importer.id}
            importer={importer}
            onPick={() => update({ importer: importer.id })}
          />
        ))}
      </Box>
      <RegistryDown error={list.registryError} />
    </>
  );
}

/** Which server the owner comes from. The choice is the list of importers the
 * server can use, each in its own name. */
export function ImportSource({ onBack, onSkip }: Readonly<SourceProps>) {
  const t = useT();
  const { data, error } = useImporters();
  return (
    <>
      <StepHeading title={t('setup.importSourceTitle')} sub={t('setup.importSourceSub')} />
      <StepBody>
        {data ? <Sources list={data} /> : null}
        {!data && !error ? <Loading /> : null}
        <StepFailure error={error ? t('setup.importListFailed') : null} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button variant="ghost" size="md" label={t('setup.skip')} onPress={onSkip} />
      </StepActions>
    </>
  );
}
