import { useCommandKey } from '#ui/lib/command-key';
import { useListCursorKeys } from '#ui/lib/list-cursor-keys.hook';
import type { CommandAction, CommandItem } from './command-list';
import type { useActionPanel } from './use-action-panel.hook';
import type { CommandPages } from './use-command-pages.hook';

interface PaletteKeysOptions {
  current: CommandItem | undefined;
  actions: ReturnType<typeof useActionPanel>;
  pages: CommandPages;
  step: (rows: number) => void;
  choose: (item: CommandItem | undefined) => void;
  chooseAction: (action: CommandAction) => void;
  chooseSecondary: () => void;
  onClose: () => void;
  modal: boolean;
}

/** The palette's keys: the arrows and Enter on the list or on the open action panel,
 *  Escape out of the panel, then out of a row's list, then out of the palette, Backspace
 *  in an empty field out of a row's list, and Command or Ctrl with K for the panel.
 *  Returns the row the keyboard cursor is on, where the platform draws one. */
function usePaletteKeys(options: PaletteKeysOptions): string | undefined {
  const { current, actions, pages, step, onClose, modal } = options;
  const cursor = useListCursorKeys({
    cursor: current?.id,
    onStep: actions.open ? actions.step : step,
    onChoose: (secondary) => chosen(options, { secondary }),
    onClose: actions.open ? actions.hide : leave(pages, onClose),
    onBack: actions.open ? undefined : pages.backspace,
  });

  useCommandKey(() => {
    if (actions.open) {
      actions.hide();
    } else if (actions.available) {
      actions.show();
    } else {
      onClose();
    }
  }, modal);

  return cursor;
}

function chosen(
  { current, actions, choose, chooseAction, chooseSecondary }: PaletteKeysOptions,
  { secondary }: { secondary: boolean },
): void {
  if (actions.open) {
    if (actions.cursor) {
      chooseAction(actions.cursor);
    }
  } else if (secondary) {
    chooseSecondary();
  } else {
    choose(current);
  }
}

/** Where Escape goes from a palette that is not in its action panel: back out of the
 *  list it is in, or closed. */
function leave(pages: CommandPages, onClose: () => void): () => void {
  return pages.depth > 0 ? pages.back : onClose;
}

export { leave, usePaletteKeys };
