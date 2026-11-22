import { useT } from '@kromatv/ui';
import { Button, ListRow, Section, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useImporters } from '#web/features/admin/import/use-importers.hook';
import { type KeptRow, keptSignIns } from '#web/features/admin/import/kept-sign-ins';
import { IMPORTS_QUERY, useForgetSignIn } from '#web/features/admin/import/use-forget-sign-in.hook';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { StepFailure } from '#web/shared/ui/step-failure.component';

function useKept() {
  const { client } = useWebRuntime();
  return useQuery({
    queryKey: IMPORTS_QUERY,
    queryFn: () => client.imports.list(),
    select: (list) => keptSignIns(list.imports),
  });
}

function KeptRowView({ row, onForget }: Readonly<{ row: KeptRow; onForget: () => void }>) {
  const t = useT();
  const importers = useImporters();
  const importer = importers.data?.importers.find((one) => one.id === row.importer);
  return (
    <ListRow.Root size="md">
      <ListRow.Label>{row.server}</ListRow.Label>
      {importer ? <ListRow.Hint>{importer.label ?? importer.name}</ListRow.Hint> : null}
      <ListRow.Trailing>
        <Button variant="ghost" size="sm" label={t('admin.importForget')} onPress={onForget} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

/** Each sign-in to another server that KROMA keeps to run an import again,
 * and the press that forgets it. It draws nothing while none is kept. */
export function KeptSignIns() {
  const t = useT();
  const { data } = useKept();
  const forget = useForgetSignIn();
  if (!data || data.length === 0) {
    return null;
  }
  return (
    <Section.Root>
      <Section.Header>
        <Section.Title>{t('admin.importKeptTitle')}</Section.Title>
      </Section.Header>
      <Text variant="meta" color="textDim">
        {t('admin.importKeptSub')}
      </Text>
      <ListRow.Group>
        {data.map((row) => (
          <KeptRowView key={row.signIn} row={row} onForget={() => forget.mutate(row)} />
        ))}
      </ListRow.Group>
      <StepFailure error={forget.isError ? t('setup.importForgetFailed') : null} />
    </Section.Root>
  );
}
