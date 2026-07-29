// The device picker as the PLAYER shows it.
//
// Same list as the app's bottom sheet, in the player's own shell - which is a
// plain <Modal>, because this screen is a native fullScreenModal and @gorhom's
// sheet renders behind it. See <PlayerPanel>.

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
      {/* Never "this device": the player IS this device, so the row would offer
          the screen the viewer is already looking at. */}
      <CastDeviceList onPick={onPick} offerLocal={false} />
    </PlayerPanel>
  );
}
