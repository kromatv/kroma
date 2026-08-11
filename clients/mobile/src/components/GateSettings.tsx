// The sign-in gate's corner gear, the phone's answer to the TV's "Paramètres"
// chip and the web gate's corner panel: the few things that have to be
// reachable BEFORE anyone can sign in.
//
// Interface language only sets the DEVICE override here. Every other client
// syncs the choice to the account, but there is no account yet at the gate —
// and a viewer who cannot read the sign-in screen cannot get to one.

import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { IconButton } from '@kroma/ui/kit';
import { useRef } from 'react';
import { useI18n, useT } from '#mobile/lib/i18n';
import { LocalePicker } from './LocalePicker';
import { SheetBody, SheetTitle, sheetChrome } from './ui/sheet';

export function GateSettings() {
  const t = useT();
  const { locale, setOverride } = useI18n();
  const sheet = useRef<BottomSheetModal>(null);

  return (
    <>
      {/* The same disc as <BackButton> in the opposite corner: same size, same
          scrim, so the gate's two corner controls read as a pair. */}
      <IconButton
        icon="settings"
        size={44}
        variant="scrim"
        focusFill
        ring={false}
        hitSlop={8}
        label={t('nav.settings')}
        onPress={() => sheet.current?.present()}
      />
      <BottomSheetModal ref={sheet} {...sheetChrome()}>
        <SheetBody>
          <SheetTitle>{t('account.uiLanguage')}</SheetTitle>
          <LocalePicker
            locale={locale}
            onPick={(next) => {
              setOverride(next);
              sheet.current?.dismiss();
            }}
          />
        </SheetBody>
      </BottomSheetModal>
    </>
  );
}
