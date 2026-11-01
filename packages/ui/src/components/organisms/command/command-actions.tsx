import { ScrollView } from 'react-native';
import { Box, Row } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Kbd } from '#ui/components/atoms/kbd';
import { Text } from '#ui/components/atoms/text';
import { Field } from '#ui/components/molecules/field';
import { styles, sv } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { onAppleHardware } from '#ui/lib/command-key';
import { useDeliberateHover } from '#ui/lib/deliberate-hover';
import { useCommand } from './command-context';
import { CommandKeys } from './command-keys';
import { ACTION_METRICS, type CommandAction, opensDanger, scrollActionsTo } from './command-list';
import { useListHeight } from './command-parts';
import { useCursorScroll } from './use-cursor-scroll';

const PANEL_WIDTH = 320;
const PANEL_INSET = 8;
const PANEL_BOTTOM = 52;

interface CommandTriggerProps {
  /** What the control is called, beside the key that does the same. */
  label: string;
}

/** The control that opens the action panel, with the key that does the same. Draws
 *  nothing while the row under the cursor has nothing to offer. */
function Trigger({ label }: Readonly<CommandTriggerProps>) {
  const { current, actions } = useCommand('Trigger');
  if (!current?.actions?.length) return null;
  return (
    <Focusable
      label={label}
      ring={false}
      expanded={actions.open}
      onPress={actions.open ? actions.hide : actions.show}
      sv={trigger}
    >
      <Text variant="meta" color="textMuted">
        {label}
      </Text>
      <CommandKeys />
    </Focusable>
  );
}

/** What Enter and a press do right now, with the key that does the same: the first action
 *  of the row under the cursor, or the one the panel's cursor is on while it is up. Draws
 *  nothing while there is nothing to run. */
function Primary() {
  const { current, actions, choose, chooseAction } = useCommand('Primary');
  const action = actions.open ? actions.cursor : current?.actions?.[0];
  if (!action) return null;
  return (
    <Focusable
      label={action.label}
      ring={false}
      onPress={() => (actions.open ? chooseAction(action) : choose(current))}
      sv={trigger}
    >
      <Text variant="meta" color="textMuted" lines={1}>
        {action.label}
      </Text>
      <Kbd icon="corner-down-left" />
    </Focusable>
  );
}

interface CommandActionsProps {
  /** The accessible name and the placeholder of the panel's field. */
  label: string;
  /** The accessible name of what closes the panel when pressed around it. */
  closeLabel?: string;
}

/** What the row under the cursor can do, over the list: the first runs on Enter, the
 *  second on Command or Ctrl with Enter, and a dangerous one sits apart at the end. */
function Actions({ label, closeLabel = 'Close actions' }: Readonly<CommandActionsProps>) {
  const s = useStyles(sDefinition);
  const { actions, current } = useCommand('Actions');
  if (!actions.open) return null;

  return (
    <>
      <Focusable
        label={closeLabel}
        ring={false}
        onPress={actions.hide}
        style={s.catcher}
        focusScale={1}
      />
      <Box
        absolute
        z={2}
        right={PANEL_INSET}
        bottom={PANEL_BOTTOM}
        w={PANEL_WIDTH}
        maxW="94%"
        bg="surface3"
        radius="lg"
        border="borderStrong"
        borderWidth={1}
        overflow="hidden"
      >
        <Box px={14} pt={10} pb={4}>
          <Text variant="meta" color="textDim" lines={1} style={s.title}>
            {current?.label}
          </Text>
        </Box>
        <PanelList />
        <PanelField label={label} />
      </Box>
    </>
  );
}

function PanelList() {
  const s = useStyles(sDefinition);
  const { actions, current, chooseAction } = useCommand('Actions');
  const point = useDeliberateHover(actions.point);
  const { shown, cursor } = actions;
  const all = current?.actions ?? [];
  const maxHeight = Math.min(ACTION_METRICS.maxHeight, useListHeight() - ACTION_METRICS.chrome);
  const scroller = useCursorScroll(
    (offset, viewport) =>
      scrollActionsTo(shown, cursor ? shown.indexOf(cursor) : -1, offset, viewport),
    maxHeight,
  );

  return (
    <ScrollView
      {...scroller}
      style={{ maxHeight }}
      contentContainerStyle={s.panelBody}
      showsVerticalScrollIndicator={false}
    >
      {shown.map((action, index) => (
        <Box key={action.id}>
          {opensDanger(shown, index) ? <Box h={1} bg="border" my={4} mx={-6} /> : null}
          <ActionRow
            action={action}
            place={all.indexOf(action)}
            cursor={action === cursor}
            onHover={point}
            onPress={chooseAction}
          />
        </Box>
      ))}
    </ScrollView>
  );
}

function ActionRow({
  action,
  place,
  cursor,
  onHover,
  onPress,
}: Readonly<{
  action: CommandAction;
  place: number;
  cursor: boolean;
  onHover: (action: CommandAction) => void;
  onPress: (action: CommandAction) => void;
}>) {
  const danger = Boolean(action.danger);
  const quiet = cursor ? 'text' : 'textMuted';
  const ink = danger ? 'danger' : quiet;

  return (
    <Focusable
      label={action.label}
      ring={false}
      onHoverIn={() => onHover(action)}
      onPress={() => onPress(action)}
      sv={actionRow}
      vars={{ cursor, danger }}
    >
      {action.icon ? <Icon name={action.icon} size={16} thickness={1.8} color={ink} /> : null}
      <Text variant="meta" color={ink} lines={1}>
        {action.label}
      </Text>
      <Box flex />
      <ActionKeys place={place} />
    </Focusable>
  );
}

function ActionKeys({ place }: Readonly<{ place: number }>) {
  if (place > 1) return null;
  const modifier = onAppleHardware() ? <Kbd icon="command" /> : <Kbd>Ctrl</Kbd>;
  return (
    <Row gap={3}>
      {place === 1 ? modifier : null}
      <Kbd icon="corner-down-left" />
    </Row>
  );
}

function PanelField({ label }: Readonly<{ label: string }>) {
  const s = useStyles(sDefinition);
  const { actions } = useCommand('Actions');

  return (
    <Box px={14} style={s.ruleTop}>
      <Field.Root label={label} hideLabel>
        <Field.Input
          value={actions.query}
          onValueChange={actions.filter}
          placeholder={label}
          physicalKeyboard
          autoFocus
          flat
          pl={0}
          pr={0}
          py={10}
        />
      </Field.Root>
    </Box>
  );
}

const trigger = sv({
  base: {
    row: true,
    align: 'center',
    gap: 8,
    h: 34,
    pl: 10,
    pr: 6,
    radius: 'sm',
    _hover: { bg: 'tint/7' },
    _focus: { bg: 'tint/7' },
  },
});

const actionRow = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 10,
      h: ACTION_METRICS.row,
      px: 8,
      radius: 'sm',
    },
  },
  variants: {
    cursor: { true: { root: { bg: 'tint/7' } } },
    danger: { true: {} },
  },
  compound: [{ when: { cursor: true, danger: true }, style: { root: { bg: 'danger/14' } } }],
  defaults: { cursor: false, danger: false },
});

const sDefinition = styles({
  catcher: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1 },
  title: { fontWeight: '600' },
  panelBody: { p: ACTION_METRICS.pad },
  ruleTop: { borderTopWidth: 1, borderTopColor: 'border' },
});

export type { CommandActionsProps, CommandTriggerProps };
export { Actions, Primary, Trigger };
