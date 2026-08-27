import { type ReactNode, useLayoutEffect } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';
import { bySize, CONTROL } from '#ui/lib/field-shell';
import { nameOf } from '#ui/lib/name-of';
import { partContext } from '#ui/lib/part-context';
import { stepShape, useStepperItem, useStepperPart } from './stepper-context';

type StepState = 'ahead' | 'current' | 'complete';

const stepperVariants = svFor<{
  root: StyleDecl;
  marker: StyleDecl;
  number: StyleDecl;
  label: StyleDecl;
  hint: StyleDecl;
  glyph: Pick<IconProps, 'color' | 'size'>;
}>()({
  slots: {
    root: { row: true, align: 'center', _hover: { bg: 'tint/8' }, _press: { bg: 'tint/14' } },
    marker: { center: true, radius: 'pill', borderWidth: 1.5, border: 'transparent', shrink: 0 },
    number: { font: 'ui', fontWeight: '700' },
    label: { font: 'ui', fontWeight: '600' },
    hint: { font: 'ui', color: 'textDim' },
    glyph: { color: 'text' },
  },
  variants: {
    size: bySize((metrics) => {
      const shape = stepShape(metrics);
      return {
        root: {
          gap: shape.gap,
          px: Math.round(metrics.px / 2),
          py: Math.round(metrics.py / 2),
          radius: metrics.radius,
        },
        marker: { w: shape.marker, h: shape.marker },
        number: { fontSize: Math.round(metrics.fontSize * 0.8), lineHeight: shape.marker },
        label: { fontSize: metrics.fontSize, lineHeight: metrics.line },
        hint: { fontSize: metrics.fontSize - 3, lineHeight: metrics.line - 4 },
        glyph: { size: Math.round(metrics.fontSize * 0.9) },
      };
    }),
    state: {
      ahead: {
        marker: { border: 'borderStrong' },
        number: { color: 'text/35' },
        label: { color: 'text/40' },
        glyph: { color: 'text/35' },
      },
      current: {
        marker: { bg: 'accent' },
        number: { color: 'accentInk' },
        label: { color: 'text' },
        glyph: { color: 'accentInk' },
      },
      complete: {
        marker: { bg: 'accentSoft' },
        number: { color: 'accentText' },
        label: { color: 'text/75' },
        glyph: { color: 'accentText' },
      },
    },
  },
  defaults: { size: 'md', state: 'ahead' },
});

type StepSlots = ReturnType<typeof stepperVariants>;

const [ItemContext, useStepperFace] = partContext<StepSlots>('Stepper.Item');

function stepStateOf(active: boolean, complete: boolean): StepState {
  if (active) return 'current';
  return complete ? 'complete' : 'ahead';
}

function Marker({
  position,
  icon,
  complete,
  slots,
}: Readonly<{ position: number; icon?: IconName; complete: boolean; slots: StepSlots }>) {
  return (
    <Box style={slots.marker}>
      <MarkerFace position={position} icon={icon} complete={complete} slots={slots} />
    </Box>
  );
}

function MarkerFace({
  position,
  icon,
  complete,
  slots,
}: Readonly<{ position: number; icon?: IconName; complete: boolean; slots: StepSlots }>) {
  if (complete) return <Icon name="check" {...slots.glyph} />;
  if (icon) return <Icon name={icon} {...slots.glyph} />;
  return <Text style={slots.number}>{position}</Text>;
}

interface StepperItemProps {
  value: string;
  /** A glyph in the marker instead of the step's number. A complete step draws
   *  the tick whatever this says. */
  icon?: IconName;
  /** Names the step to assistive tech. It draws NOTHING, and the position and
   *  the state are added to it: reach for it only where the children carry no
   *  plain text. */
  label?: string;
  /** A step nothing may enter: `Previous`, `Next` and the arrow keys pass over
   *  it rather than stopping on it. */
  disabled?: boolean;
  children?: ReactNode;
}

/** The WHOLE row is the control: one D-pad stop, and the marker is a face
 *  rather than a second target. Rendering one is what puts the step in the
 *  flow, at whatever depth it sits. */
function Item({ value, icon, label, disabled, children }: Readonly<StepperItemProps>) {
  const { flow, size, orientation, stepLabel, join, mark } = useStepperPart('Item');
  const step = useStepperItem(value);
  // Layout effects, not passive ones: they run before the first paint, so the
  // flow is whole by the time anything is drawn.
  useLayoutEffect(() => join(value), [join, value]);
  useLayoutEffect(() => mark(value, disabled === true), [mark, value, disabled]);

  const state = stepStateOf(step.active, step.complete);
  const slots = stepperVariants({ size, state });
  const metrics = CONTROL[size];
  const shape = stepShape(metrics);
  const vertical = orientation === 'vertical';
  return (
    <>
      <ItemContext.Provider value={slots}>
        <Focusable
          role="tab"
          selected={step.active}
          current={step.active ? 'step' : undefined}
          disabled={disabled || !step.reachable}
          label={stepLabel({
            position: step.index + 1,
            count: flow.count,
            title: label ?? nameOf(children),
            complete: step.complete,
          })}
          onPress={step.select}
          ring="focusInset"
          sv={stepperVariants}
          vars={{ size, state }}
          style={vertical ? STRETCH : undefined}
        >
          <Marker position={step.index + 1} icon={icon} complete={step.complete} slots={slots} />
          {children ? (
            <Box gap={2} shrink={1}>
              {children}
            </Box>
          ) : null}
        </Focusable>
      </ItemContext.Provider>
      {step.last ? null : (
        <Connector
          vertical={vertical}
          thickness={shape.connector}
          length={shape.step}
          indent={Math.round(metrics.px / 2 + (shape.marker - shape.connector) / 2)}
          stepPaddingY={Math.round(metrics.py / 2)}
          complete={step.complete}
        />
      )}
    </>
  );
}

// Drawn by the step rather than the list, which cannot see which of its
// children are steps once they are one component deep.
function Connector({
  vertical,
  thickness,
  length,
  indent,
  stepPaddingY,
  complete,
}: Readonly<{
  vertical: boolean;
  thickness: number;
  length: number;
  indent: number;
  stepPaddingY: number;
  complete: boolean;
}>) {
  const paint = complete ? 'accent' : 'border';
  if (vertical) {
    return (
      <Box
        w={thickness}
        h={length + stepPaddingY * 2}
        mt={-stepPaddingY}
        mb={-stepPaddingY}
        ml={indent}
        radius="pill"
        bg={paint}
        aria-hidden
      />
    );
  }
  return <Box grow={1} h={thickness} minW={length} radius="pill" bg={paint} aria-hidden />;
}

/** The step's drawn title; its plain text is the step's accessible name. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  const slots = useStepperFace('Label');
  return <Text style={slots.label}>{children}</Text>;
}

function Hint({ children }: Readonly<{ children: ReactNode }>) {
  const slots = useStepperFace('Hint');
  return <Text style={slots.hint}>{children}</Text>;
}

const STRETCH = { alignSelf: 'stretch' } as const;

export type { StepperItemProps };
export { Hint, Item, Label, stepperVariants };
