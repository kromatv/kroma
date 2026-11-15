// The server has no mail service, so there is no email-based reset flow: this
// self-service change is how an account rotates its own password.

import { useT } from '@kromatv/ui';
import { Button } from '@kromatv/ui/kit';
import { useState } from 'react';
import { PasswordDialog } from '#web/features/accounts/account/password-dialog';
import { SettingCard } from '#web/features/accounts/account/setting-card';

export function SecurityCard() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <SettingCard
        icon="key"
        title={t('account.password')}
        description={t('account.passwordSub')}
        aside={
          <Button
            variant="glass"
            size="sm"
            label={t('account.updatePassword')}
            onPress={() => setOpen(true)}
          />
        }
      />
      {open ? <PasswordDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
