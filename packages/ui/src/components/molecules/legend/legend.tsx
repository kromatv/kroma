// <Legend>: what the colours in a chart or a status board mean. A dot in the
// series' own paint, the name beside it, and a row that wraps.
//
// The paint is a raw colour rather than a tone, deliberately: a legend keys a
// chart drawn on a canvas, where a series' hue is assigned by POSITION and never
// cycled, so it is a value the caller already holds and not one of the palette's
// semantic steps.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import type { ColorValue } from '#ui/core';
import { partContext } from '#ui/lib/part-context';

const DOT = 9;

const [LegendContext, useLegend] = partContext<true>('Legend.Root');

interface LegendRootProps extends Omit<BoxProps, 'children'> {
  children?: ReactNode;
}

function Root({ children, ...box }: Readonly<LegendRootProps>) {
  return (
    <LegendContext.Provider value>
      <Box row wrap align="center" gap={18} {...box}>
        {children}
      </Box>
    </LegendContext.Provider>
  );
}

interface LegendItemProps {
  /** The series' own paint, as the chart was given it. */
  color: ColorValue;
  /** What the dot stands for. */
  children?: ReactNode;
}

/** One entry: the dot and what it stands for. The dot is a face and never a
 *  control - a legend reports, it does not filter. */
function Item({ color, children }: Readonly<LegendItemProps>) {
  useLegend('Item');
  return (
    <Box row align="center" gap={7}>
      <Box w={DOT} h={DOT} shrink={0} radius="circle" bg={color} />
      <Text variant="meta" color="textMuted">
        {children}
      </Text>
    </Box>
  );
}

/**
 * The key to a chart's colours.
 *
 * ```tsx
 * <Legend.Root>
 *   <Legend.Item color={CHART_SERIES.films}>Films</Legend.Item>
 *   <Legend.Item color={CHART_SERIES.tv}>Series</Legend.Item>
 * </Legend.Root>
 * ```
 */
const Legend = { Root, Item };

export type { LegendItemProps, LegendRootProps };
export { Legend };
