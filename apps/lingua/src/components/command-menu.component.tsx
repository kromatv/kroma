import { useCommandKey } from '@kromatv/ui/kit';
import { type ReactNode, useMemo, useState } from 'react';
import { CommandPalette } from '#site/components/command-palette.component';
import { commandRegistry } from '#site/lib/command-registry';
import { CommandMenuContext } from '#site/lib/use-command-menu.hook';

/** Lingua's command menu: ⌘K or Ctrl+K anywhere opens it over `children`, which may lend it rows with `useCommands`. */
export function CommandMenuProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [registry] = useState(commandRegistry);
  const [open, setOpen] = useState(false);
  useCommandKey(() => setOpen((was) => !was));
  const menu = useMemo(() => ({ open: () => setOpen(true), registry }), [registry]);
  return (
    <CommandMenuContext.Provider value={menu}>
      {children}
      {open ? <CommandPalette registry={registry} onClose={() => setOpen(false)} /> : null}
    </CommandMenuContext.Provider>
  );
}
