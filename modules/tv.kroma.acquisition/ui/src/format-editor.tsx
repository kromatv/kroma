import { apiErrorText } from '@kromatv/client';
import { useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Dialog, Field, Surface, Text, toast } from '@kromatv/ui/kit';
import { useRef, useState } from 'react';
import type { View } from 'react-native';
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
import { useFormatSummary } from './format-summary';
import { freeId } from './profile-draft';
import type { CustomFormat } from './rules-schemas';

type FocusHost = { focus: () => void };
type ScrollHost = { scrollIntoView?: (options: { block: 'nearest' }) => void };

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
  const addButton = useRef<View>(null);
  const removers = useRef(new Map<string, FocusHost>());
  const action = useAsyncAction();
  const summary = useFormatSummary();
  const isNew = format.id === '';
  const heading = t(isNew ? 'acq.formatNew' : 'acq.formatEdit');
  const ready = name.trim().length > 0 && rows.length > 0;

  const add = () => {
    minted.current += 1;
    setRows((was) => appendCondition(was, rowId(minted.current), 'releaseTitle'));
    requestAnimationFrame(() =>
      (addButton.current as ScrollHost | null)?.scrollIntoView?.({ block: 'nearest' }),
    );
  };

  const remove = (id: string) => {
    const at = rows.findIndex((row) => row.id === id);
    const next = rows[at + 1] ?? rows[at - 1];
    removers.current.delete(id);
    setRows((was) => withoutCondition(was, id));
    requestAnimationFrame(() => {
      const target = next ? removers.current.get(next.id) : null;
      if (target) target.focus();
      else (addButton.current as unknown as FocusHost | null)?.focus?.();
    });
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
        toast({ message: t('acq.formatSaved', { name: name.trim() }), tone: 'success' });
        onClose();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open onClose={onClose} width="lg" title={heading}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {heading}
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

          <Field.Root
            label={t('acq.formatName')}
            size="sm"
            value={name}
            invalid={name.trim() === ''}
            onValueChange={setName}
          >
            <Field.Input placeholder={t('acq.formatNameExample')} />
          </Field.Root>

          <Surface radius="lg" pad="sm" tone="outline">
            <Text variant="meta" color="textMuted">
              {summary(conditionsOf(rows))}
            </Text>
          </Surface>

          <Box gap={10}>
            {rows.map((row) => (
              <ConditionRow
                key={row.id}
                condition={row.condition}
                removeRef={(host: FocusHost | null) => {
                  if (host) removers.current.set(row.id, host);
                  else removers.current.delete(row.id);
                }}
                onChange={(next) => setRows((was) => withCondition(was, row.id, next))}
                onRemove={() => remove(row.id)}
              />
            ))}
            <Button
              ref={addButton}
              variant="ghost"
              size="sm"
              icon="plus"
              block
              label={t('acq.conditionAdd')}
              onPress={add}
            />
          </Box>
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
