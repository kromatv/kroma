import { type ReactNode, useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Field } from '#ui/components/molecules/field';
import { Dialog } from '#ui/components/organisms/dialog';
import { SearchKeyboard } from '#ui/components/organisms/keyboard';
import { useEntryDefaults } from '#ui/lib/field-shell';
import { FocusColumn } from '#ui/lib/focus-scope.component';
import { usePointerDriving } from '#ui/lib/input-source';
import {
  SuggestingContext,
  SuggestionRowContext,
  type SuggestionRowState,
} from './suggestion-context';
import { LoadingRow } from './suggestion-row.component';
import { commitRow, rowsOf, saysEmpty, type SuggestionSurface } from './suggestion-surface';

interface BodyProps {
  surface: SuggestionSurface;
  onPicked: () => void;
}

function Rows({ surface, onPicked }: Readonly<BodyProps>) {
  const row = useMemo<SuggestionRowState>(
    () => ({ active: false, keyed: false, onPicked }),
    [onPicked],
  );
  return (
    <FocusColumn>
      {surface.list.loading ? <LoadingRow /> : null}
      {saysEmpty(surface) ? surface.list.empty : null}
      {rowsOf(surface).map((suggestion) => (
        <SuggestionRowContext key={suggestion.key} value={row}>
          {suggestion.node}
        </SuggestionRowContext>
      ))}
    </FocusColumn>
  );
}

function Body({ surface, onPicked }: Readonly<BodyProps>) {
  const { physicalKeyboard, size } = useEntryDefaults();
  const { text, onText } = surface.entry;
  const { label, placeholder } = surface.look;
  const { suggested, trailing } = surface.list;
  const commit = () => {
    if (commitRow(surface, suggested.exact ?? suggested.shown[0] ?? trailing)) {
      onPicked();
    }
  };
  return (
    <Box gap={16}>
      <Field.Root label={label} hideLabel value={text} onValueChange={onText}>
        <Field.Input
          icon="search"
          placeholder={placeholder}
          physicalKeyboard={physicalKeyboard}
          autoFocus={physicalKeyboard}
          onSubmit={commit}
        />
      </Field.Root>
      {physicalKeyboard ? null : (
        <SearchKeyboard value={text} onValueChange={onText} size={size === 'tv' ? 'tv' : 'sm'} />
      )}
      <Rows surface={surface} onPicked={onPicked} />
    </Box>
  );
}

interface SuggestionDialogProps extends BodyProps {
  children: ReactNode;
}

/** The D-pad's presentation: `children` are the stops in the well, one of
 *  which opens a dialog with the entry, the keyboard where there is no real
 *  one, and the suggestions as rows. `onPicked` runs once a row or Enter has
 *  picked. */
function SuggestionDialog({ surface, onPicked, children }: Readonly<SuggestionDialogProps>) {
  const pointerDriving = usePointerDriving();
  return (
    <>
      {children}
      <Dialog.Root
        open={surface.entry.open}
        onClose={() => surface.entry.setOpen(false, pointerDriving() ? 'outside' : 'back')}
        title={surface.look.label}
        width="md"
      >
        <SuggestingContext value={surface.field}>
          <Body surface={surface} onPicked={onPicked} />
        </SuggestingContext>
      </Dialog.Root>
    </>
  );
}

export { SuggestionDialog };
