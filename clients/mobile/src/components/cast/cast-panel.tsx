// The device picker as the PLAYER shows it: the same list in the player's own
// shell, which is a plain <Modal>, because this screen is a native
// fullScreenModal and @gorhom's sheet renders behind it.

import type { DeviceId } from '@kromatv/client';
import { CastDeviceList } from '#mobile/components/cast/cast-device-list';
import { PlayerPanel } from '#mobile/player/player-panel';

export function CastPanel({
  visible,
  onClose,
  onPick,
}: Readonly<{
  visible: boolean;
  onClose(): void;
  onPick(receiverId: DeviceId | null): void;
}>) {
  return (
    <PlayerPanel visible={visible} onClose={onClose}>
      {/* Never "this device": the player IS this device. */}
      <CastDeviceList onPick={onPick} offerLocal={false} />
    </PlayerPanel>
  );
}
