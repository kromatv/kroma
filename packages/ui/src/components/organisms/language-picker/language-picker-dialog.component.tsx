import { useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Dialog } from '#ui/components/organisms/dialog';
import { FocusColumn } from '#ui/lib/focus-scope.component';
import { usePointerDriving } from '#ui/lib/input-source';
import { LanguagePickerContext, type LanguagePickerState } from './language-picker-context';
import { Input } from './language-picker-input.component';
import { Empty, List } from './language-picker-list.component';

function SearchHead({ state }: Readonly<{ state: LanguagePickerState }>) {
  return (
    <LanguagePickerContext value={state}>
      <Box gap={16}>
        <Text variant="h2">{state.label}</Text>
        <Input />
      </Box>
    </LanguagePickerContext>
  );
}

/** The list over the screen, opened by the trigger: a search over it pinned
 *  above where there is one, and only the list scrolls. A television mounts it
 *  in its overlay host, outside the Root, so it carries the Root's state in. */
function LanguagePickerDialog({ state }: Readonly<{ state: LanguagePickerState }>) {
  const pointerDriving = usePointerDriving();
  const inside = useMemo(() => ({ ...state, entry: true }), [state]);
  return (
    <Dialog.Root
      open
      onClose={() => state.setOpen(false, pointerDriving() ? 'outside' : 'back')}
      title={state.label}
      width="md"
      fullHeight={state.searchable}
    >
      {state.searchable ? (
        <Dialog.Header>
          <SearchHead state={inside} />
        </Dialog.Header>
      ) : null}
      <Dialog.Panel>
        <LanguagePickerContext value={inside}>
          <FocusColumn>
            <List />
            <Empty />
          </FocusColumn>
        </LanguagePickerContext>
      </Dialog.Panel>
    </Dialog.Root>
  );
}

export { LanguagePickerDialog };
