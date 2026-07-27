// "Move to TV", in the player's top bar.
//
// Handing a film over means the position travels with it, so the set picks up on
// the frame the browser was on rather than at the last saved heartbeat - and the
// browser then stops, because two screens playing the same film, one of them in
// front of you, is nobody's intent.

import type { ItemId } from '@kroma/core';
import { useCast, useT } from '@kroma/ui';
import { Icon } from '@kroma/ui/kit';
import { castPicker } from '#web/features/playback/cast/cast-picker';

export function CastHandoff({
  itemId,
  positionMs,
  onHandedOff,
}: Readonly<{
  itemId: ItemId;
  /** Where the browser is right now - read at press time, not at render. */
  positionMs: () => number;
  /** Stop local playback and leave the player. */
  onHandedOff: () => void;
}>) {
  const t = useT();
  const { available, playOn } = useCast();
  if (!available) return null;
  return (
    <button
      type="button"
      aria-label={t('cast.moveToTv')}
      title={t('cast.moveToTv')}
      onClick={async () => {
        const picked = await castPicker();
        if (!picked) return;
        if (await playOn(picked, itemId, Math.round(positionMs()))) onHandedOff();
      }}
      className="grid h-10.5 w-10.5 place-items-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20"
    >
      <Icon name="cast" size={20} stroke={1.8} />
    </button>
  );
}
