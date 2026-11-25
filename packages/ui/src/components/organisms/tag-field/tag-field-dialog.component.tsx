import { useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { Dialog } from '#ui/components/organisms/dialog';
import { SearchKeyboard } from '#ui/components/organisms/keyboard';
import { sv } from '#ui/core';
import { PLACEHOLDER, useEntryDefaults } from '#ui/lib/field-shell';
import { FocusColumn } from '#ui/lib/focus-scope.component';
import { usePointerDriving } from '#ui/lib/input-source';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import {
  TagFieldContext,
  TagFieldRowContext,
  type TagFieldRowState,
  useTagField,
} from './tag-field-context';
import { faceOf, FreeRow, LoadingRow } from './tag-field-item';
import type { TagFieldSurfaceProps } from './tag-field-surface';
import { TagFieldWell } from './tag-field-well.component';

type DialogClose = 'picked' | 'outside' | 'back';

const addVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 8,
      radius: 'pill',
      _hover: { bg: 'tint/8' },
      _focus: { bg: 'accentSoft' },
    },
  },
  variants: { alone: { true: { root: { grow: 1 } } } },
  defaults: { alone: false },
});

function AddStop({ surface }: Readonly<{ surface: TagFieldSurfaceProps }>) {
  const { metrics, control, tags, placeholder } = surface;
  const alone = tags.length === 0;
  return (
    <Focusable
      label={surface.label}
      onPress={() => control.setOpen(true, 'trigger')}
      sv={addVariants}
      vars={{ alone }}
      style={{ height: metrics.tag, minWidth: metrics.tag, paddingHorizontal: metrics.inset }}
    >
      <Icon name="plus" size={Math.round(metrics.tag * 0.5)} color="textMuted" />
      {alone && placeholder ? (
        <Text lines={1} color={PLACEHOLDER} style={{ fontSize: metrics.control.fontSize }}>
          {placeholder}
        </Text>
      ) : null}
    </Focusable>
  );
}

function useDialogCommit(surface: TagFieldSurfaceProps, onPicked: () => void) {
  return () => {
    const { exact, shown, free } = surface.suggested;
    const item = exact ?? shown[0];
    const name = item?.props.value ?? free;
    if (name !== null) {
      surface.pick(name, item ? faceOf(item.props) : null);
      onPicked();
    }
  };
}

function Rows({
  surface,
  onPicked,
}: Readonly<{ surface: TagFieldSurfaceProps; onPicked: () => void }>) {
  const { suggested, loading, freeLabel } = surface;
  const row = useMemo<TagFieldRowState>(
    () => ({ active: false, keyed: false, onPicked }),
    [onPicked],
  );
  const empty = suggested.shown.length === 0 && !loading && surface.control.query.trim() !== '';
  return (
    <FocusColumn>
      {loading ? <LoadingRow /> : null}
      {empty ? surface.empty : null}
      {suggested.shown.map((item) => (
        <TagFieldRowContext key={item.key} value={row}>
          {item}
        </TagFieldRowContext>
      ))}
      {suggested.free !== null && freeLabel !== null ? (
        <TagFieldRowContext value={row}>
          <FreeRow name={suggested.free} label={freeLabel} />
        </TagFieldRowContext>
      ) : null}
    </FocusColumn>
  );
}

function Body({
  surface,
  onPicked,
}: Readonly<{ surface: TagFieldSurfaceProps; onPicked: () => void }>) {
  const { physicalKeyboard, size } = useEntryDefaults();
  const { control, label, placeholder } = surface;
  const commit = useDialogCommit(surface, onPicked);
  return (
    <Box gap={16}>
      <Field.Root label={label} hideLabel value={control.query} onValueChange={control.type}>
        <Field.Input
          icon="search"
          placeholder={placeholder}
          physicalKeyboard={physicalKeyboard}
          autoFocus={physicalKeyboard}
          onSubmit={commit}
        />
      </Field.Root>
      {physicalKeyboard ? null : (
        <SearchKeyboard
          value={control.query}
          onValueChange={control.type}
          size={size === 'tv' ? 'tv' : 'sm'}
        />
      )}
      <Rows surface={surface} onPicked={onPicked} />
    </Box>
  );
}

/** The D-pad's presentation: every tag a stop whose press takes it out, then a
 *  stop that opens a dialog with the entry, the keyboard where there is no
 *  real one, and the suggestions as rows. A pick closes the dialog on the tag
 *  it added. */
function TagFieldDialog(props: Readonly<TagFieldSurfaceProps>) {
  const field = useTagField('Root');
  const pointerDriving = usePointerDriving();
  const close = (reason: DialogClose) => props.control.setOpen(false, reason);
  const onPicked = useStableCallback(() => close('picked'));
  return (
    <>
      <TagFieldWell metrics={props.metrics} filled focused={false} invalid={props.invalid}>
        {props.tags}
        {props.full || props.disabled ? null : <AddStop surface={props} />}
      </TagFieldWell>
      <Dialog.Root
        open={props.control.open}
        onClose={() => close(pointerDriving() ? 'outside' : 'back')}
        title={props.label}
        width="md"
      >
        <TagFieldContext value={field}>
          <Body surface={props} onPicked={onPicked} />
        </TagFieldContext>
      </Dialog.Root>
    </>
  );
}

export { TagFieldDialog };
