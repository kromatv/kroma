import { useStyleScope, useThemeVersion } from '@kromatv/ui/kit';

// The device picker, as the app's chrome shows it: a bottom sheet, sized to
// its content: a household has a handful of TVs, not a hundred languages.

import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { styles, useStyles } from '@kromatv/ui/kit';
import type { Ref } from 'react';
import { CastDeviceList, type CastDeviceListProps } from '#mobile/components/cast/CastDeviceList';
import { SheetBody, sheetChrome } from '#mobile/components/ui';

export function CastSheet({
  ref,
  ...props
}: Readonly<CastDeviceListProps & { ref?: Ref<BottomSheetModal> }>) {
  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(sDefinition);

  return (
    <BottomSheetModal
      ref={ref}
      {...sheetChrome(scope)}
      // The list can become a code prompt, and this sheet sits exactly where
      // the keyboard comes up. `interactive`, not `extend`: the field is at
      // the bottom of the content, so the sheet has to RIDE above the
      // keyboard rather than grow into it. `restore` puts it back down
      // afterwards instead of leaving it floating over the backdrop.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <SheetBody style={s.body}>
        {/* Passed through rather than re-defaulted: the list owns what its own
            props mean, and a second default here can only drift from it. */}
        <CastDeviceList {...props} />
      </SheetBody>
    </BottomSheetModal>
  );
}

const sDefinition = styles({
  body: { gap: 2 },
});
