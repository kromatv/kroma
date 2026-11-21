import type { Import, ImportId, ImportStatus, ImportTally } from '@kromatv/client/imports';
import { JobKey } from '@kromatv/client/jobs';
import { useT } from '@kromatv/ui';
import { Button, ListRow, Progress, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { atWork, type TallyKind, tallies } from '#web/features/setup/import-run';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const ASK_AGAIN_MS = 1000;
const JOB = JobKey.parse('household.import');

const TITLE = {
  queued: 'setup.importRunTitle',
  running: 'setup.importRunTitle',
  completed: 'setup.importDoneTitle',
  cancelled: 'setup.importCancelledTitle',
  failed: 'setup.importFailedTitle',
} as const satisfies Record<ImportStatus, string>;

const SUB = {
  queued: 'setup.importRunSub',
  running: 'setup.importRunSub',
  completed: 'setup.importDoneSub',
  cancelled: 'setup.importKeptSub',
  failed: 'setup.importKeptSub',
} as const satisfies Record<ImportStatus, string>;

const KIND_NAME = {
  libraries: 'setup.importLibraries',
  users: 'setup.importUsers',
  titles: 'setup.importCountTitles',
  states: 'setup.importCountStates',
  plays: 'setup.importCountPlays',
} as const satisfies Record<TallyKind, string>;

interface RunProps {
  id: ImportId;
  onContinue: () => void;
}

function useImport(id: ImportId) {
  const { client } = useWebRuntime();
  return useQuery({
    queryKey: ['setup', 'import', id],
    queryFn: () => client.imports.get(id),
    refetchInterval: (query) => (atWork(query.state.data?.status) ? ASK_AGAIN_MS : false),
  });
}

function useTallyLine(tally: ImportTally | undefined): string {
  const t = useT();
  const counts = t('setup.importTally', { brought: tally?.brought ?? 0, read: tally?.read ?? 0 });
  const unmatched = tally?.unmatched ?? 0;
  return unmatched > 0
    ? `${counts} · ${t('setup.importTallyUnmatched', { count: unmatched })}`
    : counts;
}

function TallyRow({ kind, tally }: Readonly<{ kind: TallyKind; tally: ImportTally | undefined }>) {
  const t = useT();
  const line = useTallyLine(tally);
  return (
    <ListRow.Root label={t(KIND_NAME[kind])} chevron={false}>
      <ListRow.Label>{t(KIND_NAME[kind])}</ListRow.Label>
      <ListRow.Trailing>
        <Text variant="meta" color="textMuted">
          {line}
        </Text>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function Tallies({ found }: Readonly<{ found: Import | undefined }>) {
  const rows = tallies(found);
  if (rows.length === 0) {
    return null;
  }
  return (
    <ListRow.Group>
      {rows.map((row) => (
        <TallyRow key={row.kind} kind={row.kind} tally={row.tally} />
      ))}
    </ListRow.Group>
  );
}

function RefusedLibraries({ found }: Readonly<{ found: Import | undefined }>) {
  const t = useT();
  const refused = found?.report.refusedLibraries ?? [];
  if (refused.length === 0) {
    return null;
  }
  return (
    <>
      {refused.map((library) => (
        <Text key={library.name} variant="meta" color="danger">
          {t('setup.importLibraryRefused', {
            name: library.name,
            library: library.sharesFilesWith,
          })}
        </Text>
      ))}
    </>
  );
}

function CancelAction({ working }: Readonly<{ working: boolean }>) {
  const t = useT();
  const { client } = useWebRuntime();
  if (!working) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      size="md"
      label={t('setup.importCancel')}
      onPress={() => void client.jobs.cancel(JOB).catch(() => undefined)}
    />
  );
}

/** The import as it runs: what it read and brought so far, by kind, and how it
 * ended. The owner goes on while it runs, or cancels it, and what it had
 * brought stays. */
export function ImportRun({ id, onContinue }: Readonly<RunProps>) {
  const t = useT();
  const { data } = useImport(id);
  const status = data?.status ?? 'queued';
  const working = atWork(data?.status);
  return (
    <>
      <StepHeading title={t(TITLE[status])} sub={t(SUB[status])} />
      <StepBody>
        {working ? <Progress value={0} waiting label={t(TITLE[status])} /> : null}
        <Tallies found={data} />
        <RefusedLibraries found={data} />
      </StepBody>
      <StepActions>
        <CancelAction working={working} />
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          onPress={onContinue}
        />
      </StepActions>
    </>
  );
}
