// <Disclosure>: a collapsible section with a divider header ("Advanced"). The
// trigger is a button announcing `expanded`, so assistive tech hears the state
// the chevron shows.
//
// Yoga has no `order`, so the Root sorts its direct children once - the same
// shape <Rail> and <Callout> take - and publishes the open state through
// context, which is what lets the panel be written anywhere inside the root.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { partContext } from '#ui/lib/part-context';
import { useControllable } from '#ui/lib/use-controllable';

interface DisclosureState {
  open: boolean;
  toggle: () => void;
}

const [DisclosureContext, useDisclosure] = partContext<DisclosureState>('Disclosure.Root');

interface DisclosureRootProps {
  /** Present: you own the state (controlled). Absent: the disclosure runs
   *  itself from `defaultOpen` and reports through `onOpenChange`. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (next: boolean) => void;
  style?: StyleProp<ViewStyle>;
  /** A `<Disclosure.Trigger>` and a `<Disclosure.Panel>` must be DIRECT
   *  children to take their slot; given a panel, it IS the body and stray
   *  children beside it are dropped. */
  children?: ReactNode;
}

interface Sorted {
  trigger: ReactNode[];
  panel: ReactNode[];
  loose: ReactNode[];
}

function sort(children: ReactNode): Sorted {
  const at: Sorted = { trigger: [], panel: [], loose: [] };
  for (const child of Children.toArray(children)) {
    const part = isValidElement(child) ? child.type : null;
    if (part === Trigger) at.trigger.push(child);
    else if (part === Panel) at.panel.push(child);
    else at.loose.push(child);
  }
  return at;
}

// A written part always wins the slot; the sugar only fills one nobody claimed.
function slot(written: readonly ReactNode[], sugar: ReactNode): ReactNode {
  return written.length > 0 ? written : sugar;
}

function Root({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  style,
  children,
}: Readonly<DisclosureRootProps>) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const state = useMemo<DisclosureState>(
    () => ({ open, toggle: () => setOpen(!open) }),
    [open, setOpen],
  );
  const at = useMemo(() => sort(children), [children]);
  return (
    <DisclosureContext.Provider value={state}>
      <Box style={style}>
        {at.trigger}
        {slot(at.panel, <Panel>{at.loose}</Panel>)}
      </Box>
    </DisclosureContext.Provider>
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
  const { open, toggle } = useDisclosure('Trigger');
  const name = label ?? (typeof children === 'string' ? children : undefined);
  return (
    <>
      <Divider spacing={0} />
      <Focusable
        label={name}
        expanded={open}
        onPress={toggle}
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
  if (!open) return null;
  return <Box pt={4}>{children}</Box>;
}

const TRIGGER_STATES = { hover: { opacity: 0.85 } } as const;

const s = styles({
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
