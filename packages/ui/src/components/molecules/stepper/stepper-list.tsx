import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { CONTROL } from '#ui/lib/field-shell';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope';
import { stepShape, useStepperPart } from './stepper-context';

interface StepperListProps {
  /** The steps, at any depth: a `<Stepper.Item>` joins the flow by rendering,
   *  so a component of your own holding them works. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** The indicator: the steps in order, with the rule between them. */
function List({ children, style }: Readonly<StepperListProps>) {
  const { flow, size, orientation, label } = useStepperPart('List');
  const vertical = orientation === 'vertical';
  const shape = stepShape(CONTROL[size]);

  // Stops at the ends rather than wrapping the way <SegmentGroup> does: a
  // sequence has a first step and a last one.
  const walk = (delta: -1 | 1) => {
    for (let at = flow.index + delta; at >= 0 && at < flow.count; at += delta) {
      const key = flow.steps[at];
      if (key === undefined || !flow.reachable(key)) continue;
      flow.goTo(key);
      return;
    }
  };

  const Group = vertical ? FocusColumn : FocusRegion;
  return (
    <Group>
      <Box
        row={!vertical}
        align={vertical ? 'stretch' : 'center'}
        // The row fills what holds it, so the rules between the steps have
        // something to stretch into: a <FocusRegion> lays its children out in a
        // row, where a shrink-wrapped list leaves them at their minimum.
        grow={vertical ? undefined : 1}
        gap={vertical ? 0 : shape.gap}
        role="tablist"
        accessibilityLabel={label}
        onKeyDown={(event) => {
          const key = event.nativeEvent.key;
          if (key === 'ArrowLeft' || key === 'ArrowUp') walk(-1);
          else if (key === 'ArrowRight' || key === 'ArrowDown') walk(1);
        }}
        style={style}
      >
        {children}
      </Box>
    </Group>
  );
}

export type { StepperListProps };
export { List };
