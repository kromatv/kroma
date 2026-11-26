import { useStableCallback } from '#ui/lib/stable-callback.hook';
import type { CommandAction, CommandItem } from './command-list';
import type { useActionPanel } from './use-action-panel.hook';
import { type CommandPages, opensList } from './use-command-pages.hook';

interface ChoiceOptions {
  current: CommandItem | undefined;
  at: number;
  actions: ReturnType<typeof useActionPanel>;
  pages: CommandPages;
  onSelect: (item: CommandItem, action?: CommandAction) => void;
  onClose: () => void;
}

interface Choice {
  item: CommandItem;
  action: CommandAction | undefined;
}

function run({ item, action }: Choice, options: ChoiceOptions): void {
  const { at, actions, pages, onSelect, onClose } = options;
  if (opensList(item, action)) {
    if (actions.open) {
      actions.hide();
    }
    pages.enter(item, at);
    return;
  }
  onSelect(item, action);
  onClose();
}

function secondOf(item: CommandItem | undefined): Choice | undefined {
  const action = item?.actions?.[1];
  return item && action ? { item, action } : undefined;
}

/** What choosing a row or one of its actions does: open the row's own list when that is
 *  what the action is, or hand it to `onSelect` and close. Each is stable, since it is a
 *  prop on every row. */
function useCommandChoice(options: ChoiceOptions) {
  const choose = useStableCallback((item: CommandItem | undefined) => {
    if (item) {
      run({ item, action: item.actions?.[0] }, options);
    }
  });

  const chooseAction = useStableCallback((action: CommandAction) => {
    if (options.current) {
      run({ item: options.current, action }, options);
    }
  });

  const chooseSecondary = useStableCallback(() => {
    const second = secondOf(options.current);
    if (second) {
      run(second, options);
    }
  });

  return { choose, chooseAction, chooseSecondary };
}

export { useCommandChoice };
