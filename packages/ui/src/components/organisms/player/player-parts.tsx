// The slots a host fills. Each part renders its children and nothing else: the
// chrome around them is the Root's, and a wrapper here would put an element
// between the stage and the <video> the injected stylesheet sizes (lib/styles).

import { Children, createContext, isValidElement, type ReactNode, useContext } from 'react';

const PlayerSlotContext = createContext(false);

function useSlot(part: string): void {
  const inRoot = useContext(PlayerSlotContext);
  if (!inRoot) throw new Error(`<Player.${part}> must be a direct child of <Player.Root>`);
}

interface PlayerMediaProps {
  /** The surface the controller drives: an in-page `<video>`, or the placeholder
   *  a native plane draws behind. It rounds ITSELF (see `useSurfaceRadius`); a
   *  rounded parent does not clip a hardware video layer. */
  children: ReactNode;
}

/** The picture, under the whole chrome. */
function Media({ children }: Readonly<PlayerMediaProps>) {
  useSlot('Media');
  return <>{children}</>;
}

interface PlayerActionsProps {
  children: ReactNode;
}

/** The host's own controls, at the end of the top bar beside the warning pill
 *  (the web's "play on TV"). A television passes none: it is the screen a film
 *  is cast TO. */
function Actions({ children }: Readonly<PlayerActionsProps>) {
  useSlot('Actions');
  return <>{children}</>;
}

interface PlayerPanelProps {
  children: ReactNode;
}

/** A region that takes the stage over: the "an admin stopped this" notice. While
 *  one is mounted the chrome is locked — the picture stops taking presses, the
 *  buffering spinner stays down, and only Back / OK get through, both meaning
 *  leave. */
function Panel({ children }: Readonly<PlayerPanelProps>) {
  useSlot('Panel');
  return <>{children}</>;
}

interface PlayerSlots {
  media: ReactNode;
  actions: ReactNode;
  panel: ReactNode;
  rest: ReactNode[];
}

function sortSlots(children: ReactNode): PlayerSlots {
  const at: PlayerSlots = { media: null, actions: null, panel: null, rest: [] };
  Children.forEach(children, (child) => {
    const part = isValidElement(child) ? child.type : null;
    if (part === Media) at.media = child;
    else if (part === Actions) at.actions = child;
    else if (part === Panel) at.panel = child;
    else if (child != null) at.rest.push(child);
  });
  return { ...at, rest: Children.toArray(at.rest) };
}

export type { PlayerActionsProps, PlayerMediaProps, PlayerPanelProps };
export { Actions, Media, Panel, PlayerSlotContext, sortSlots };
