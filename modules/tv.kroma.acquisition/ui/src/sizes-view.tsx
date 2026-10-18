import { apiErrorText } from '@kromatv/client';
import { useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Field, Row, Surface, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import type { RulesView } from './rules-schemas';
import { SizeTableView } from './size-table';
import { badCell, draftOfSizes, type SizesDraft, setCell, toSizes } from './sizes-draft';

export function SizesView({
  rules,
  onSaved,
}: Readonly<{ rules: RulesView; onSaved: () => Promise<void> }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [draft, setDraft] = useState<SizesDraft>(() => draftOfSizes(rules.sizes, rules.qualities));
  const action = useAsyncAction();
  const bad = badCell(draft, rules.qualities);
  const onCell = (key: string, value: string) => setDraft((d) => setCell(d, key, value));

  const save = () =>
    action.run(
      async () => {
        await acquisition.saveSizes(toSizes(draft, rules.qualities));
        await onSaved();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Box gap={20}>
      <Text variant="meta" color="textDim">
        {t('acq.sizesHint')}
      </Text>

      {action.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{action.error}</Callout.Title>
        </Callout.Root>
      ) : null}

      <Surface radius="xl" pad="lg">
        <Row wrap between gap={16} align="flex-end">
          <Box flex minW={240} gap={8}>
            <Row wrap gap={16} align="flex-end">
              <Box w={170}>
                <Field.Root
                  label={t('acq.movieRuntime')}
                  size="sm"
                  invalid={bad === 'movieRuntime'}
                  value={draft.movieRuntime}
                  onValueChange={(next) => setDraft((d) => ({ ...d, movieRuntime: next }))}
                >
                  <Field.Input type="number" />
                </Field.Root>
              </Box>
              <Box w={170}>
                <Field.Root
                  label={t('acq.episodeRuntime')}
                  size="sm"
                  invalid={bad === 'episodeRuntime'}
                  value={draft.episodeRuntime}
                  onValueChange={(next) => setDraft((d) => ({ ...d, episodeRuntime: next }))}
                >
                  <Field.Input type="number" />
                </Field.Root>
              </Box>
            </Row>
            <Text variant="meta" color={bad ? 'dangerHover' : 'textDim'}>
              {bad ? t('acq.sizesBad') : t('acq.sizesRuntimeHint')}
            </Text>
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
      </Surface>

      <SizeTableView
        table="movie"
        title={t('acq.sizesMovies')}
        qualities={rules.qualities}
        draft={draft}
        bad={bad}
        onCell={onCell}
      />
      <SizeTableView
        table="episode"
        title={t('acq.sizesEpisodes')}
        qualities={rules.qualities}
        draft={draft}
        bad={bad}
        onCell={onCell}
      />
    </Box>
  );
}
