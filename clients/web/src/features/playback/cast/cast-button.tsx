// "Play on TV", next to Play on a title page.
//
// It only exists when a TV does: an action that cannot do anything is worse than
// no action at all, so with an empty roster this renders nothing rather than an
// enabled button that opens an empty picker.

import type { ItemId } from '@kroma/core';
import { useCast, useT } from '@kroma/ui';
import { Button } from '@kroma/ui/kit';
import { castPicker } from '#web/features/playback/cast/cast-picker';

export function CastButton({ itemId }: Readonly<{ itemId: ItemId }>) {
  const t = useT();
  const { available, playOn } = useCast();
  if (!available) return null;
  return (
    <Button
      variant="outline"
      icon="cast"
      label={t('cast.title')}
      onPress={async () => {
        const picked = await castPicker();
        // The position is the account's own resume point, which the receiver
        // already knows - nothing to hand over from a page that isn't playing.
        if (picked) await playOn(picked, itemId);
      }}
    />
  );
}
