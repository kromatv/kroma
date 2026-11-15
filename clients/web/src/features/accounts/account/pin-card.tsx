// The account's profile-lock PIN, which gates switching into this profile on a
// shared device. It is not the login credential.

import { useT } from '@kromatv/ui';
import { Button, Row, Switch } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PinDialog, type PinTask } from '#web/features/accounts/account/pin-dialog';
import { SettingCard } from '#web/features/accounts/account/setting-card';
import { useAuth } from '#web/shared/lib/auth';

export function PinCard() {
  const t = useT();
  const { user } = useAuth();
  const [task, setTask] = useState<PinTask | null>(null);

  if (!user) return null;
  const on = user.hasPin;

  return (
    <>
      <SettingCard
        icon="lock"
        title={t('account.profileLock')}
        description={on ? t('account.pinSubSet') : t('account.pinSub')}
        aside={
          <Row gap={14}>
            {on ? (
              <Button
                variant="glass"
                size="sm"
                label={t('account.changePin')}
                onPress={() => setTask('change')}
              />
            ) : null}
            <Switch
              checked={on}
              onCheckedChange={() => setTask(on ? 'remove' : 'set')}
              label={t('account.profileLock')}
            />
          </Row>
        }
      />
      {task ? <PinDialog task={task} onClose={() => setTask(null)} /> : null}
    </>
  );
}
