// The controls panel: one editor per control a story declares.
//
// Every widget here is built from the kit itself, which is the point. Storybook
// renders its controls in a separate React tree with its own design, so the
// panel can only ever be operated with a mouse. These are `Chip`s and
// `Field`s, so the panel is D-pad navigable and the whole workbench runs on
// an actual television, next to the components it is inspecting.

import { Box, Chip, Divider, Field, Switch, style, Text } from '@kroma/ui/kit';
import type { Control, ResolvedControl } from './derive';

// Beyond this many options a row of chips stops being scannable and turns
// into a wall, so the control becomes a stepper through the list instead.
const MAX_CHIPS = 8;

interface ControlRowProps {
  name: string;
  control: Control;
  value: unknown;
  onChange: (next: unknown) => void;
}

// Steps a value forwards and backwards, showing where it currently sits.
// Used for numbers and for option lists too long to lay out flat.
function Stepper({
  label,
  onPrev,
  onNext,
}: Readonly<{ label: string; onPrev: () => void; onNext: () => void }>) {
  return (
    <Box row align="center" gap={8}>
      <Chip variant="surface" icon="chevron-left" onPress={onPrev} />
      <Box minW={120} align="center">
        <Text variant="meta" lines={1}>
          {label}
        </Text>
      </Box>
      <Chip variant="surface" icon="chevron-right" onPress={onNext} />
    </Box>
  );
}

function SelectControl({
  options,
  value,
  onChange,
}: Readonly<{ options: string[]; value: unknown; onChange: (next: string) => void }>) {
  const current = typeof value === 'string' ? value : '';
  if (options.length <= MAX_CHIPS) {
    return (
      <Box row wrap gap={8}>
        {options.map((option) => (
          <Chip
            key={option}
            variant="subtle"
            label={option || 'none'}
            active={option === current}
            onPress={() => onChange(option)}
          />
        ))}
      </Box>
    );
  }
  const at = Math.max(0, options.indexOf(current));
  const step = (delta: number) =>
    onChange(options[(at + delta + options.length) % options.length] as string);
  return <Stepper label={current || 'none'} onPrev={() => step(-1)} onNext={() => step(1)} />;
}

function NumberControl({
  control,
  value,
  onChange,
}: Readonly<{
  control: Extract<Control, { kind: 'number' }>;
  value: unknown;
  onChange: (next: number) => void;
}>) {
  const current = typeof value === 'number' ? value : control.min;
  const step = (delta: number) => {
    const next = Math.min(control.max, Math.max(control.min, current + delta * control.step));
    // Fractional steps accumulate binary error fast (0.1 + 0.2), and a control
    // reading 0.30000000000000004 undermines the whole panel.
    onChange(Number(next.toFixed(4)));
  };
  return <Stepper label={String(current)} onPrev={() => step(-1)} onNext={() => step(1)} />;
}

function ControlRow({ name, control, value, onChange }: Readonly<ControlRowProps>) {
  // A boolean is a single row: the name on the left, the kit's own Switch on
  // the right, exactly as it would appear on a settings screen.
  if (control.kind === 'boolean') {
    return (
      <Box row align="center" justify="space-between" gap={12}>
        <Text variant="meta" color="textDim">
          {name}
        </Text>
        <Switch checked={value === true} onCheckedChange={onChange} label={name} />
      </Box>
    );
  }
  return (
    <Box gap={8}>
      <Text variant="meta" color="textDim">
        {name}
      </Text>
      {control.kind === 'text' ? (
        // The prop's name is already drawn above by the row, so the field
        // draws none - it only carries it as the accessible name.
        <Field.Root label={name} hideLabel>
          <Field.Input
            value={typeof value === 'string' ? value : ''}
            onValueChange={onChange}
            physicalKeyboard
            // A field on a form screen takes the caret on mount; a prop editor
            // must not. Left on, opening any story with a text prop scrolled the
            // panel to that prop and put the caret in it, so the panel opened
            // halfway down and the first thing typed went into the args.
            autoFocus={false}
            py={10}
            radius="md"
            bg="surface2"
            textStyle={textInput}
          />
        </Field.Root>
      ) : null}
      {control.kind === 'select' ? (
        <SelectControl options={control.options} value={value} onChange={onChange} />
      ) : null}
      {control.kind === 'number' ? (
        <NumberControl control={control} value={value} onChange={onChange} />
      ) : null}
    </Box>
  );
}

interface ControlsProps {
  controls: readonly ResolvedControl[];
  args: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  // Put every control back to the story's own defaults. Omitted where there
  // is nothing to put back.
  onReset?: () => void;
}

/** The panel. Variants lead, because they are the design's own axes; the plain
 * props that follow are the content you pour into them. */
function Controls({ controls, args, onChange, onReset }: Readonly<ControlsProps>) {
  const variants = controls.filter((control) => control.variant);
  const props = controls.filter((control) => !control.variant);
  if (controls.length === 0) {
    return (
      <Text variant="meta" color="textDim">
        This component exposes nothing to adjust.
      </Text>
    );
  }
  // Empty sections drop out, and the rule appears only BETWEEN two that are
  // there - the divider is a function of the list, not of two separate
  // conditions.
  const sections = [
    { title: 'Variants', rows: variants },
    { title: 'Props', rows: props },
  ].filter((section) => section.rows.length > 0);
  return (
    <Box gap={24}>
      {sections.map((section, at) => (
        <Box key={section.title} gap={24}>
          {at > 0 ? <Divider spacing={0} /> : null}
          <Box gap={16}>
            {/* `Reset` rides on the FIRST section's heading rather than in the
                panel's tab row: it is an action on these controls, so it belongs
                where they start - at the top of the panel, not at the end of the
                scroll and not on screen while the props table is open. */}
            <Box row align="center" between gap={12}>
              <Text variant="overline" color="accent">
                {section.title}
              </Text>
              {at === 0 && onReset ? (
                <Chip variant="surface" icon="repeat" label="Reset" onPress={onReset} />
              ) : null}
            </Box>
            {section.rows.map((control) => (
              <ControlRow
                key={control.key}
                name={control.key}
                control={control.control}
                value={args[control.key]}
                onChange={(next) => onChange(control.key, next)}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

const textInput = style({ fontSize: 15, fontWeight: '600' });

export type { ControlsProps };
export { ControlRow, Controls, MAX_CHIPS };
