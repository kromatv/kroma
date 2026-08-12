// The device picker, as the app's chrome shows it: a bottom sheet, sized to
// its content: a household has a handful of TVs, not a hundred languages.

import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { styles } from '@kroma/ui/kit';
import { forwardRef } from 'react';
import { CastDeviceList, type CastDeviceListProps } from '#mobile/components/cast/CastDeviceList';
import { SheetBody, sheetChrome } from '#mobile/components/ui';

export const CastSheet = forwardRef<BottomSheetModal, CastDeviceListProps>(
  function CastSheet(props, ref) {
    return (
      <BottomSheetModal ref={ref} {...sheetChrome()}>
        <SheetBody style={s.body}>
          {/* Passed through rather than re-defaulted: the list owns what its own
            props mean, and a second default here can only drift from it. */}
          <CastDeviceList {...props} />
        </SheetBody>
      </BottomSheetModal>
    );
  },
);

const s = styles({
  body: { gap: 2 },
});
