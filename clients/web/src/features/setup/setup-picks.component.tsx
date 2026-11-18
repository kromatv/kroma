import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

interface Picks {
  /** The modules the owner selected and the server does not hold yet. */
  picked: readonly string[];
  /** The modules the server holds and the owner deselected. */
  dropped: readonly string[];
  /** The modules whose install the owner started in this setup. */
  started: readonly string[];
  setPicked: (ids: string[]) => void;
  setDropped: (ids: string[]) => void;
  /** Hands every choice over to be applied: none stays picked or dropped. */
  start: () => void;
  /** Takes back a module whose install failed, so that it can be picked again. */
  giveUp: (id: string) => void;
}

const Context = createContext<Picks | null>(null);

/** Holds what the owner selected on a step, so that it is still there when
 * they come back to the step. */
export function SetupPicks({ children }: Readonly<{ children: ReactNode }>) {
  const [picked, setPicked] = useState<string[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [started, setStarted] = useState<string[]>([]);
  const picks = useMemo(
    () => ({
      picked,
      dropped,
      started,
      setPicked,
      setDropped,
      start: () => {
        setStarted((before) => [...before, ...picked]);
        setPicked([]);
        setDropped([]);
      },
      giveUp: (id: string) => setStarted((before) => before.filter((held) => held !== id)),
    }),
    [picked, dropped, started],
  );
  return <Context.Provider value={picks}>{children}</Context.Provider>;
}

/** What the owner selected in this setup. */
export function useSetupPicks(): Picks {
  const picks = useContext(Context);
  if (!picks) {
    throw new Error('useSetupPicks needs a <SetupPicks> above it');
  }
  return picks;
}
