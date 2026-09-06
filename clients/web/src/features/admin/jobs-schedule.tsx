// The "edit schedule" modal for a background job: cron input with presets, a
// "manual only" option, and reset-to-default. The server validates the cron.

import { KromaApiError } from '@kroma/client';
import type { JobInfo } from '@kroma/client/jobs';
import { useT } from '@kroma/ui';
import { Badge, Box, Button, Chip, Dialog, Field, Row, styles, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const s = styles({
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  cron: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11.5,
    fontWeight: '600',
  },
  resetLabel: { fontSize: 12, fontWeight: '600' },
});

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
        await client.jobs.update(job.key, { schedule: value.trim() || null });
        call.end(true);
      },
      (e) =>
        e instanceof KromaApiError && e.status === 400
          ? t('jobs.cronInvalid')
          : t('jobs.saveFailed'),
    );

  return (
    <Dialog.Root open title={t('jobs.editSchedule')} width="md" onClose={() => call.end(false)}>
      <Field.Root label={t('jobs.cronExpr')}>
        <Field.Input
          icon="clock"
          value={value}
          onValueChange={setValue}
          placeholder="0 4 * * *"
          textStyle={s.mono}
        />
      </Field.Root>

      <Row wrap gap={8}>
        {PRESETS.map((p) => (
          <Chip key={p.expr} variant="surface" onPress={() => setValue(p.expr)}>
            <Text style={s.cron} color="textMuted">
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
          <Button
            variant="ghost"
            size="sm"
            label={t('jobs.resetDefault')}
            onPress={() => setValue(job.defaultSchedule ?? '')}
          >
            <Text color="accentText" style={s.resetLabel}>
              {t('jobs.resetDefault')}
            </Text>
            <Badge tone="neutral">{job.defaultSchedule}</Badge>
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
