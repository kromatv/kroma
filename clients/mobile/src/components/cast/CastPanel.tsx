// The device picker as the PLAYER shows it: the same list in the player's own
// shell, which is a plain <Modal>, because this screen is a native
// fullScreenModal and @gorhom's sheet renders behind it.

import { CastDeviceList } from '#mobile/components/cast/CastDeviceList';
import { PlayerPanel } from '#mobile/player/PlayerPanel';

export function CastPanel({
  visible,
  onClose,
  onPick,
}: Readonly<{
  visible: boolean;
  onClose(): void;
  onPick(receiverId: string | null): void;
}>) {
  return (
    <PlayerPanel visible={visible} onClose={onClose}>
      {/* Never "this device": the player IS this device. */}
      <CastDeviceList onPick={onPick} offerLocal={false} />
    </PlayerPanel>
  );
}
