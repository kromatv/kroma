// The server has no mail service, so there is no email-based reset flow: this
// self-service change is how an account rotates its own password.

import { useT } from '@kroma/ui';
import { Button, Field } from '@kroma/ui/kit';
import { useState } from 'react';
import { Panel, passwordStrength, StatusText, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

const NEW_PASSWORD_ENTRY = { autoComplete: 'new-password' } as const;

export function SecurityCard() {
  const t = useT();
  const { client } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const save = useSave();

  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 4 && confirm.length > 0 && !mismatch;

  const submit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!valid) return;
    save.run(async () => {
      await client.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
    }, t('account.saveFailed'));
  };

  return (
    <Panel className="p-5.5">
      <div className="mb-1 font-display text-[15px] font-bold text-text">
        {t('account.updatePassword')}
      </div>
      <div className="mb-4.5 text-[12.5px] text-muted">{t('auth.passwordHint')}</div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
        <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5625rem)]">
          <Field
            label={t('account.currentPassword')}
            type="password"
            placeholder="••••••••"
            value={current}
            onChange={setCurrent}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <Field
            label={t('account.newPassword')}
            type="password"
            placeholder="••••••••"
            value={next}
            onChange={setNext}
            entry={NEW_PASSWORD_ENTRY}
          />
          <div className="flex items-center gap-2.5">
            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width,background-color] duration-200"
                style={{ width: strength.width, background: strength.color }}
              />
            </div>
            {strength.labelKey ? (
              <span
                className="min-w-[54px] text-right text-[11px] font-bold"
                style={{ color: strength.color }}
              >
                {t(strength.labelKey)}
              </span>
            ) : null}
          </div>
        </div>

        <Field
          label={t('account.confirmPassword')}
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={setConfirm}
          error={mismatch ? t('account.passwordMismatch') : undefined}
          entry={NEW_PASSWORD_ENTRY}
        />

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button
            size="sm"
            icon="device-floppy"
            label={save.status === 'saving' ? t('common.saving') : t('account.updatePassword')}
            onPress={submit}
            loading={save.status === 'saving'}
            disabled={!valid}
          />
          <StatusText status={save.status} error={save.error} />
        </div>
      </form>
    </Panel>
  );
}
