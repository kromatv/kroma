// <DataField>: one fact, read - an overline naming it and the value under it.
//
// Not a <Field>: nothing here is editable and there is no control to label, so
// there is no shell, no focus ring and no error state. A title screen's
// "Duree / 2 h 04", a library card's "Taille / 1,4 To" and a person's
// "Naissance / 1974" are all this.

import { createContext, type ReactNode, useContext } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import type { TypeRole } from '#ui/core';
import { type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';

interface Shape {
  label: TypeRole;
  value: TypeRole;
  gap: number;
}

// A console readout, a page readout, and a page readout at ten feet. The label
// is always an overline: it is the one role the ramp authors for exactly this
// job, and hand-shrinking it per screen is how six copies drifted to six sizes.
const SHAPE: Record<ControlSize, Shape> = {
  sm: { label: 'overline', value: 'meta', gap: 2 },
  md: { label: 'overline', value: 'label', gap: 4 },
  tv: { label: 'overlineTv', value: 'labelTv', gap: 6 },
};

const DataFieldContext = createContext<Shape | null>(null);

function useShape(part: string): Shape {
  const shape = useContext(DataFieldContext);
  if (!shape) throw new Error(`<DataField.${part}> must be used inside <DataField.Root>`);
  return shape;
}

interface DataFieldRootProps {
  /** How loud the pair reads, defaulting to the app's entry size
   *  (`setEntryDefaults`) so a readout matches the rows beside it. */
  size?: ControlSize;
  /** Sugar for `<Label/><Value/>`. `children` render under both. */
  label?: string;
  value?: ReactNode;
  children?: ReactNode;
}

function Root({ size, label, value, children }: Readonly<DataFieldRootProps>) {
  const shape = SHAPE[size ?? entryDefaultSize()];
  return (
    <DataFieldContext.Provider value={shape}>
      {/* minW 0 so a long value truncates inside its column instead of widening
          the row of readouts it sits in. */}
      <Box minW={0} gap={shape.gap}>
        {label === undefined ? null : <Label>{label}</Label>}
        {value === undefined ? null : <Value>{value}</Value>}
        {children}
      </Box>
    </DataFieldContext.Provider>
  );
}

/** What the fact is called. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  const shape = useShape('Label');
  return (
    <Text variant={shape.label} color="textDim">
      {children}
    </Text>
  );
}

interface DataFieldValueProps {
  /** Clamp to N lines with an ellipsis. Unclamped by default: a readout in a
   *  tight grid asks for 1, one under a hero is allowed to wrap. */
  lines?: number;
  children: ReactNode;
}

/** The fact itself. */
function Value({ lines, children }: Readonly<DataFieldValueProps>) {
  const shape = useShape('Value');
  return (
    <Text variant={shape.value} lines={lines}>
      {children}
    </Text>
  );
}

/**
 * A label-above-value readout.
 *
 * ```tsx
 * <DataField.Root label="Duree" value="2 h 04" />
 *
 * <DataField.Root label="Reseau">
 *   <DataField.Value lines={1}>{session.network}</DataField.Value>
 * </DataField.Root>
 * ```
 */
const DataField = { Root, Label, Value };

export type { DataFieldRootProps, DataFieldValueProps };
export { DataField };
