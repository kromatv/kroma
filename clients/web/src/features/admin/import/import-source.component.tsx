import type { Importer, ImporterList } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  EmptyState,
  Grid,
  ListRow,
  styles,
  useStyles,
} from '@kromatv/ui/kit';
import { ImportFrame } from '#web/features/admin/import/import-frame.component';
import { useImportSession } from '#web/features/admin/import/import-session.component';
import { ImporterIcon } from '#web/features/admin/import/importer-icon.component';
import { ListSkeleton } from '#web/shared/ui';
import { StepFailure } from '#web/shared/ui/step-failure.component';
import { useImporters } from '#web/features/admin/import/use-importers.hook';

const CHOICE_MIN = 240;
const FIRST_ROOM = 480;

const sDefinition = styles({ fill: { flex: 1 } });

interface SourceProps {
  onBack?: () => void;
  onSkip?: () => void;
}

function ImporterRow({ importer, onPick }: Readonly<{ importer: Importer; onPick: () => void }>) {
  const t = useT();
  const s = useStyles(sDefinition);
  return (
    <ListRow.Root size="md" ground="surface" onPress={onPick} style={s.fill}>
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
      <Grid min={CHOICE_MIN} width={FIRST_ROOM} gap={12}>
        {list.importers.map((importer) => (
          <ImporterRow
            key={importer.id}
            importer={importer}
            onPick={() => update({ importer: importer.id })}
          />
        ))}
      </Grid>
      <RegistryDown error={list.registryError} />
    </>
  );
}

function SourceActions({ onBack, onSkip }: Readonly<SourceProps>) {
  const t = useT();
  if (!onBack && !onSkip) {
    return null;
  }
  return (
    <ImportFrame.Footer>
      {onBack ? <ImportFrame.Previous onPress={onBack} /> : null}
      <ImportFrame.Actions>
        {onSkip ? <Button variant="ghost" label={t('setup.skip')} onPress={onSkip} /> : null}
      </ImportFrame.Actions>
    </ImportFrame.Footer>
  );
}

/** Which server the owner comes from. The choice is the list of importers the
 * server can use, each in its own name. */
export function ImportSource({ onBack, onSkip }: Readonly<SourceProps>) {
  const t = useT();
  const { data, error } = useImporters();
  return (
    <>
      <ImportFrame.Header>
        <ImportFrame.Title>{t('setup.importSourceTitle')}</ImportFrame.Title>
        <ImportFrame.Subtitle>{t('setup.importSourceSub')}</ImportFrame.Subtitle>
      </ImportFrame.Header>
      <ImportFrame.Panel>
        {data ? <Sources list={data} /> : null}
        {!data && !error ? <ListSkeleton count={2} height={84} /> : null}
        <StepFailure error={error ? t('setup.importListFailed') : null} />
      </ImportFrame.Panel>
      <SourceActions onBack={onBack} onSkip={onSkip} />
    </>
  );
}
