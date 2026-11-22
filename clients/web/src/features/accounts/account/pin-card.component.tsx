// The account's profile-lock PIN, which gates switching into this profile on a
// shared device. It is not the login credential.

import { useT } from '@kromatv/ui';
import { Button, Row, Switch } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PinDialog, type PinTask } from '#web/features/accounts/account/pin-dialog.component';
import { SettingCard } from '#web/features/accounts/account/setting-card.component';
import { useAuth } from '#web/shared/lib/auth';

/** The profile lock. `asked` opens the new PIN dialog at once, as a link to
 *  it does, unless the profile already has a PIN. */
export function PinCard({ asked = false }: Readonly<{ asked?: boolean }>) {
  const t = useT();
  const { user } = useAuth();
  const [task, setTask] = useState(() => firstTask({ asked, locked: user?.hasPin === true }));

  if (!user) {
    return null;
  }
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

function firstTask(page: Readonly<{ asked: boolean; locked: boolean }>): PinTask | null {
  return page.asked && !page.locked ? 'set' : null;
}
