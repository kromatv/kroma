import { type ReactNode, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { type ChangeDetails, type ControlOf, defineControl, useControl } from '#ui/lib/control';
import { partContext } from '#ui/lib/part-context';
import { sortParts } from '#ui/lib/parts';

const disclosureControl = defineControl('disclosure', {
  state: { open: false },
  actions: { toggle: ({ open }) => ({ open: !open }) },
});

const [DisclosureContext, useDisclosure] =
  partContext<ControlOf<typeof disclosureControl>>('Disclosure.Root');

interface DisclosureRootProps {
  /** Present: you own the state (controlled). Absent: the disclosure runs
   *  itself from `defaultOpen` and reports through `onOpenChange`. */
  open?: boolean;
  defaultOpen?: boolean;
  /** `details.cancel()` keeps the section as it was. */
  onOpenChange?: (next: boolean, details: ChangeDetails) => void;
  style?: StyleProp<ViewStyle>;
  /** A `<Disclosure.Trigger>` and a `<Disclosure.Panel>` must be DIRECT
   *  children to take their slot; given a panel, it IS the body and stray
   *  children beside it are dropped. */
  children?: ReactNode;
}

function slot(written: readonly ReactNode[], sugar: ReactNode): ReactNode {
  return written.length > 0 ? written : sugar;
}

function Root({ style, children, ...props }: Readonly<DisclosureRootProps>) {
  const [control] = useControl(disclosureControl, props);
  // Yoga has no `order`, so the Root sorts its direct children once and publishes
  // the open state through context, which lets the panel be written anywhere.
  const [trigger, panel, loose] = useMemo(() => sortParts(children, Trigger, Panel), [children]);
  return (
    <DisclosureContext value={control}>
      <Box style={style}>
        {trigger}
        {slot(panel, <Panel>{loose}</Panel>)}
      </Box>
    </DisclosureContext>
  );
}

interface DisclosureTriggerProps {
  /** The section's heading. A plain string names the row to assistive tech as
   *  well. */
  children: ReactNode;
  /** Names the row to assistive tech. It draws NOTHING: reach for it only where
   *  the heading is richer than a string and so has no plain text to be read. */
  label?: string;
}

/** What opens the section, and the rule above it. The whole row is the control:
 *  one D-pad stop, and the chevron is a face rather than a second target. */
function Trigger({ children, label }: Readonly<DisclosureTriggerProps>) {
  const s = useStyles(sDefinition);

  const { open, toggle } = useDisclosure('Trigger');
  const name = label ?? (typeof children === 'string' ? children : undefined);
  return (
    <>
      <Divider spacing={0} />
      <Focusable
        label={name}
        expanded={open}
        onPress={toggle}
        ring="inside"
        style={s.trigger}
        states={TRIGGER_STATES}
      >
        <Text variant="overline" color="accentText">
          {children}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textMuted" />
      </Focusable>
    </>
  );
}

/** The region the trigger swaps in. It is unmounted while closed, so nothing
 *  inside it is reachable by a pointer, a screen reader or a D-pad. */
function Panel({ children }: Readonly<{ children: ReactNode }>) {
  const { open } = useDisclosure('Panel');
  if (!open) {
    return null;
  }
  return <Box pt={4}>{children}</Box>;
}

const TRIGGER_STATES = { hover: { opacity: 0.85 } } as const;

const sDefinition = styles({
  trigger: {
    row: true,
    align: 'center',
    justify: 'space-between',
    gap: 12,
    py: 16,
    self: 'stretch',
  },
});

/**
 * A collapsible section behind a divider header.
 *
 * ```tsx
 * <Disclosure.Root>
 *   <Disclosure.Trigger>Avance</Disclosure.Trigger>
 *   <Field.Root label="Endpoint" />
 * </Disclosure.Root>
 *
 * <Disclosure.Root defaultOpen>
 *   <Disclosure.Trigger>Avance</Disclosure.Trigger>
 *   <Disclosure.Panel>
 *     <Field.Root label="Endpoint" />
 *   </Disclosure.Panel>
 * </Disclosure.Root>
 * ```
 */
const Disclosure = { Root, Trigger, Panel };

export type { DisclosureRootProps, DisclosureTriggerProps };
export { Disclosure };
