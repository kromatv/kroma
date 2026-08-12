// The "edit schedule" modal for a background job: cron input with presets, a
// "manual only" option, and reset-to-default. The server validates the cron.

import { type JobInfo, KromaApiError } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Chip, Dialog, Field, Row, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const MONO = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as const;
const CRON = { ...MONO, fontSize: 11.5, fontWeight: '600' } as const;
const RESET_LABEL = { fontSize: 12, fontWeight: '600' } as const;

const PRESETS: { label: string; expr: string }[] = [
  { label: '@hourly', expr: '0 * * * *' },
  { label: '04:00', expr: '0 4 * * *' },
  { label: '05:00', expr: '0 5 * * *' },
  { label: 'Sun 03:00', expr: '0 3 * * 0' },
  { label: '1st 03:00', expr: '0 3 1 * *' },
];

export const ScheduleModal = createCallable<{ job: JobInfo }, boolean>(({ call, job }) => {
  const t = useT();
  const { client } = useAuth();
  const [value, setValue] = useState(job.schedule ?? '');
  const { busy, error, run } = useAsyncAction();

  const save = () =>
    run(
      async () => {
        await client.updateJob(job.key, { schedule: value.trim() || null });
        call.end(true);
      },
      (e) =>
        e instanceof KromaApiError && e.status === 400
          ? t('jobs.cronInvalid')
          : t('jobs.saveFailed'),
    );

  return (
    <Dialog.Root open title={t('jobs.editSchedule')} width={520} onClose={() => call.end(false)}>
      <Field.Root label={t('jobs.cronExpr')}>
        <Field.Input
          icon="clock"
          value={value}
          onValueChange={setValue}
          placeholder="0 4 * * *"
          textStyle={MONO}
        />
      </Field.Root>

      <Row wrap gap={8}>
        {PRESETS.map((p) => (
          <Chip key={p.expr} variant="surface" onPress={() => setValue(p.expr)}>
            <Text style={CRON} color="textMuted">
              {p.label}
            </Text>
          </Chip>
        ))}
        <Chip variant="surface" label={t('jobs.manual')} onPress={() => setValue('')} />
      </Row>

      <Text variant="meta" color="textDim">
        {t('jobs.cronHint')}
      </Text>
      {job.defaultSchedule && job.defaultSchedule !== value ? (
        <Box self="flex-start">
          <Button variant="ghost" size="sm" onPress={() => setValue(job.defaultSchedule ?? '')}>
            <Text color="accentText" style={RESET_LABEL}>
              {t('jobs.resetDefault')} ({job.defaultSchedule})
            </Text>
          </Button>
        </Box>
      ) : null}

      {error ? (
        <Text variant="meta" color="danger">
          {error}
        </Text>
      ) : null}

      <Dialog.Actions
        onCancel={() => call.end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('jobs.saving') : t('common.save')}
        busy={busy}
      />
    </Dialog.Root>
  );
});
