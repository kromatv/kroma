// The "edit schedule" modal for a background job: cron input with presets, a
// "manual only" option, and reset-to-default. The server validates the cron.

import { type JobInfo, KromaApiError } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, Chip, Txt } from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/shell';
import { Field, Modal, ModalActions, TextInput } from '#web/features/admin/ui';
import { useAuth } from '#web/shared/lib/auth';

const CRON = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11.5,
  fontWeight: '600',
} as const;
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
    <Modal title={t('jobs.editSchedule')} onClose={() => call.end(false)}>
      <Field label={t('jobs.cronExpr')}>
        <TextInput
          value={value}
          onChange={setValue}
          placeholder="0 4 * * *"
          className="w-full font-mono"
        />
      </Field>

      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Chip key={p.expr} variant="surface" onPress={() => setValue(p.expr)}>
            <Txt style={CRON} color="textMuted">
              {p.label}
            </Txt>
          </Chip>
        ))}
        <Chip variant="surface" label={t('jobs.manual')} onPress={() => setValue('')} />
      </div>

      <p className="mb-1 text-[12px] leading-relaxed text-dim">{t('jobs.cronHint')}</p>
      {job.defaultSchedule && job.defaultSchedule !== value ? (
        <div className="flex">
          <Button variant="ghost" size="sm" onPress={() => setValue(job.defaultSchedule ?? '')}>
            <Txt color="accent" style={RESET_LABEL}>
              {t('jobs.resetDefault')} ({job.defaultSchedule})
            </Txt>
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 text-[12.5px] font-semibold text-[#E8536A]">{error}</div>
      ) : null}

      <ModalActions
        onCancel={() => call.end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('jobs.saving') : t('common.save')}
        busy={busy}
      />
    </Modal>
  );
});
