import { apiErrorText } from '@kromatv/client';
import { useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Dialog, Divider, Field, Row, Text } from '@kromatv/ui/kit';
import { useRef, useState } from 'react';
import { useAcquisitionApi } from './api';
import {
  appendCondition,
  conditionsOf,
  draftConditions,
  rowId,
  withCondition,
  withoutCondition,
} from './condition-draft';
import { ConditionRow } from './condition-row';
import { freeId } from './profile-draft';
import type { CustomFormat } from './rules-schemas';

export function FormatEditor({
  format,
  taken,
  onClose,
  onSaved,
}: Readonly<{
  format: CustomFormat;
  taken: readonly string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [name, setName] = useState(format.name);
  const [rows, setRows] = useState(() => draftConditions(format.conditions));
  const minted = useRef(format.conditions.length);
  const action = useAsyncAction();
  const ready = name.trim().length > 0 && rows.length > 0;

  const add = () => {
    minted.current += 1;
    setRows((was) => appendCondition(was, rowId(minted.current), 'releaseTitle'));
  };

  const save = () =>
    action.run(
      async () => {
        await acquisition.saveFormat({
          id: format.id || freeId(name, taken),
          name: name.trim(),
          conditions: conditionsOf(rows),
        });
        await onSaved();
        onClose();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open onClose={onClose} width="xl" title={t('acq.formatEdit')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('acq.formatEdit')}
        </Text>
        <Text variant="meta" color="textDim">
          {t('acq.formatMatchRule')}
        </Text>
      </Dialog.Header>
      <Dialog.Panel>
        <Box gap={16}>
          {action.error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{action.error}</Callout.Title>
            </Callout.Root>
          ) : null}

          <Row wrap between gap={16} align="flex-end">
            <Box w={300}>
              <Field.Root
                label={t('acq.formatName')}
                size="sm"
                value={name}
                onValueChange={setName}
              >
                <Field.Input placeholder="VO + VFF" />
              </Field.Root>
            </Box>
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              label={t('acq.conditionAdd')}
              onPress={add}
            />
          </Row>

          <Divider color="tint/5" />

          {rows.length === 0 ? (
            <Text variant="meta" color="textDim">
              {t('acq.formatNoConditions')}
            </Text>
          ) : (
            <Box gap={10}>
              {rows.map((row) => (
                <ConditionRow
                  key={row.id}
                  condition={row.condition}
                  onChange={(next) => setRows((was) => withCondition(was, row.id, next))}
                  onRemove={() => setRows((was) => withoutCondition(was, row.id))}
                />
              ))}
            </Box>
          )}
        </Box>
      </Dialog.Panel>
      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
          <Button
            icon="check"
            label={t('common.save')}
            loading={action.busy}
            disabled={!ready}
            onPress={save}
          />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}
