import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { markCorner } from '#ui/components/organisms/suggestions/entry-metrics';
import { EntryWell } from '#ui/components/organisms/suggestions/entry-well.component';
import { SuggestionDialog } from '#ui/components/organisms/suggestions/suggestion-dialog.component';
import { sv, useStyleScope } from '#ui/core';
import { PLACEHOLDER } from '#ui/lib/field-shell';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import type { TagFieldSurfaceProps } from './tag-field-surface';

const addVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 8,
      _hover: { bg: 'tint/8' },
      _focus: { bg: 'accentSoft' },
    },
  },
  variants: { alone: { true: { root: { grow: 1 } } } },
  defaults: { alone: false },
});

function AddStop({ surface, tags }: Readonly<TagFieldSurfaceProps>) {
  const { metrics } = surface;
  const { label, placeholder } = surface.look;
  const scope = useStyleScope();
  const alone = tags.length === 0;
  return (
    <Focusable
      label={label}
      onPress={() => surface.entry.setOpen(true, 'trigger')}
      sv={addVariants}
      vars={{ alone }}
      style={{
        height: metrics.mark,
        minWidth: metrics.mark,
        paddingHorizontal: metrics.inset,
        borderRadius: markCorner(metrics, scope),
      }}
    >
      <Icon name="plus" size={Math.round(metrics.mark * 0.5)} color="textMuted" />
      {alone && placeholder ? (
        <Text lines={1} color={PLACEHOLDER} style={{ fontSize: metrics.control.fontSize }}>
          {placeholder}
        </Text>
      ) : null}
    </Focusable>
  );
}

/** The D-pad's presentation: every tag a stop whose press takes it out, then a
 *  stop that opens a dialog with the entry, the keyboard where there is no
 *  real one, and the suggestions as rows. A pick closes the dialog on the tag
 *  it added. */
function TagFieldDialog(props: Readonly<TagFieldSurfaceProps>) {
  const { surface, control, tags } = props;
  const onPicked = useStableCallback(() => control.setOpen(false, 'picked'));
  return (
    <SuggestionDialog surface={surface} onPicked={onPicked}>
      <EntryWell metrics={surface.metrics} filled focused={false} invalid={surface.look.invalid}>
        {tags}
        {props.full || surface.look.disabled ? null : <AddStop {...props} />}
      </EntryWell>
    </SuggestionDialog>
  );
}

export { TagFieldDialog };
