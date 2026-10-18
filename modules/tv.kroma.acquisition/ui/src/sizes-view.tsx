import { apiErrorText } from '@kromatv/client';
import { useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Field, Row, SegmentGroup, Text, toast } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import type { RulesView } from './rules-schemas';
import { SizeTableView } from './size-table';
import {
  badCell,
  draftOfSizes,
  type SizesDraft,
  type SizeTable,
  setCell,
  toSizes,
} from './sizes-draft';

const TABLES: readonly SizeTable[] = ['movie', 'episode'];

const TABLE_LABEL: Record<SizeTable, string> = {
  movie: 'acq.sizesMovies',
  episode: 'acq.sizesEpisodes',
};

const RUNTIME_W = 180;

export function SizesView({
  rules,
  onSaved,
}: Readonly<{ rules: RulesView; onSaved: () => Promise<void> }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [draft, setDraft] = useState<SizesDraft>(() => draftOfSizes(rules.sizes, rules.qualities));
  const [table, setTable] = useState<SizeTable>('movie');
  const action = useAsyncAction();
  const bad = badCell(draft, rules.qualities);
  const runtimeKey = table === 'movie' ? 'movieRuntime' : 'episodeRuntime';

  const save = () =>
    action.run(
      async () => {
        await acquisition.saveSizes(toSizes(draft, rules.qualities));
        await onSaved();
        toast({ message: t('acq.sizesSaved'), tone: 'success' });
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Box gap={14}>
      {action.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{action.error}</Callout.Title>
        </Callout.Root>
      ) : null}

      <Row wrap between gap={12} align="flex-end">
        <SegmentGroup.Root
          value={table}
          onValueChange={setTable}
          label={t('acq.sizesFor')}
          size="sm"
        >
          {TABLES.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{t(TABLE_LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
        <Row gap={10} align="flex-end">
          <Box w={RUNTIME_W}>
            <Field.Root
              label={t('acq.defaultRuntime')}
              size="sm"
              invalid={bad === runtimeKey}
              value={draft[runtimeKey]}
              onValueChange={(next) => setDraft((d) => ({ ...d, [runtimeKey]: next }))}
            >
              <Field.Input type="number" />
            </Field.Root>
          </Box>
          <Button
            size="sm"
            icon="check"
            label={t('common.save')}
            loading={action.busy}
            disabled={bad !== null}
            onPress={save}
          />
        </Row>
      </Row>

      {bad ? (
        <Text variant="meta" color="dangerHover">
          {t('acq.sizesBad')}
        </Text>
      ) : null}

      <SizeTableView
        table={table}
        qualities={rules.qualities}
        draft={draft}
        bad={bad}
        onCell={(key, value) => setDraft((d) => setCell(d, key, value))}
      />
    </Box>
  );
}
