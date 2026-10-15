// The context a part checks it sits in, so a part written anywhere but under
// <Player.Root> fails loudly instead of drawing nothing.

import { createContext, type ReactNode, useContext } from 'react';
import { ControlledFocusMirror } from '#ui/lib/controlled-focus-mirror';

const PlayerSlotContext = createContext(false);

/** What the Root renders around its parts: the context each part checks it sits
 *  in, and the focus mirror the chrome's own focus needs. */
function PlayerScope({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <PlayerSlotContext.Provider value={true}>
      <ControlledFocusMirror>{children}</ControlledFocusMirror>
    </PlayerSlotContext.Provider>
  );
}

function useSlot(part: string): void {
  const inRoot = useContext(PlayerSlotContext);
  if (!inRoot) throw new Error(`<Player.${part}> must be a direct child of <Player.Root>`);
}

export { PlayerScope, useSlot };
