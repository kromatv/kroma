// The device picker, as the app's chrome shows it: a bottom sheet.
//
// Sizes itself to its content (a household has a handful of TVs, not a hundred
// languages), so unlike LangPickerSheet it keeps @gorhom's dynamic sizing and a
// <BottomSheetView> - with the drawer floor <SheetBody> puts under it, because
// one TV's worth of content is not a drawer's worth of height. The list inside
// is <CastDeviceList>, which the player draws in its own panel instead - see
// that module for why.

import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { StyleSheet } from 'react-native';
import { CastDeviceList, type CastDeviceListProps } from '#mobile/components/cast/CastDeviceList';
import { SheetBody, sheetChrome } from '#mobile/components/ui';

export const CastSheet = forwardRef<BottomSheetModal, CastDeviceListProps>(
  function CastSheet(props, ref) {
    return (
      <BottomSheetModal ref={ref} {...sheetChrome}>
        <SheetBody style={styles.body}>
          {/* Passed through rather than re-defaulted: the list owns what its own
            props mean, and a second default here can only drift from it. */}
          <CastDeviceList {...props} />
        </SheetBody>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  body: { gap: 2 },
});
