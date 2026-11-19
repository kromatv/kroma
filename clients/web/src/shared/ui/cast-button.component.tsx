// "Play on TV", next to Play on a title page.
//
// It only exists when a TV does: an action that cannot do anything is worse than
// no action at all, so with an empty roster this renders nothing rather than an
// enabled button that opens an empty picker.

import type { DeviceId } from '@kromatv/client';
import type { ItemId } from '@kromatv/client/media';
import { useCast, useT } from '@kromatv/ui';
import { Button, toast } from '@kromatv/ui/kit';
import { castPicker } from '#web/shared/ui/cast-picker.component';
import { obviousReceiver } from './obvious-receiver';

export function CastButton({ itemId }: Readonly<{ itemId: ItemId }>) {
  const t = useT();
  const { available, receivers, active, playOn } = useCast();
  if (!available) {
    return null;
  }
  const choose = async (): Promise<DeviceId | null> => {
    const obvious = obviousReceiver(receivers, active);
    return obvious ? obvious.id : ((await castPicker()) ?? null);
  };
  return (
    <Button
      variant="outline"
      icon="cast"
      label={t('cast.title')}
      onPress={async () => {
        const picked = await choose();
        if (!picked) {
          return;
        }
        const failure = await playOn(picked, itemId);
        const device = receivers.find((r) => r.id === picked)?.name ?? '';
        toast({ message: failure ? t(failure) : t('cast.playingOn', { device }) });
      }}
    />
  );
}
