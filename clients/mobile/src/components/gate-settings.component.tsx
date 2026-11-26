// The sign-in gate's corner gear, the phone's answer to the TV's "Paramètres"
// chip and the web gate's corner panel: the few things that have to be
// reachable BEFORE anyone can sign in.
//
// Interface language only sets the DEVICE override here. Every other client
// syncs the choice to the account, but there is no account yet at the gate,
// and a viewer who cannot read the sign-in screen cannot get to one.

import { LOCALES } from '@kromatv/core';
import { IconButton, LanguagePicker } from '@kromatv/ui/kit';
import { useState } from 'react';
import { osLanguageTags, useI18n, useT } from '#mobile/lib/i18n';

export function GateSettings() {
  const t = useT();
  const { locale, setOverride } = useI18n();
  const [open, setOpen] = useState(false);
  const [device] = useState(osLanguageTags);

  return (
    <LanguagePicker.Root
      locales={LOCALES}
      label={t('account.uiLanguage')}
      value={locale}
      onValueChange={setOverride}
      open={open}
      onOpenChange={setOpen}
      preferred={device}
    >
      {/* The same disc as <BackButton> in the opposite corner: same size, same
          scrim, so the gate's two corner controls read as a pair. */}
      <IconButton
        icon="settings"
        diameter={44}
        variant="scrim"
        focusFill
        ring={false}
        hitSlop={8}
        label={t('nav.settings')}
        onPress={() => setOpen(true)}
      />
    </LanguagePicker.Root>
  );
}
