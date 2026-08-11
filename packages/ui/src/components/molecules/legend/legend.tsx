// <Legend>: what the colours in a chart or a status board mean. A dot in the
// series' own paint, the name beside it, and a row that wraps.
//
// The paint is a raw colour rather than a tone, deliberately: a legend keys a
// chart drawn on a canvas, where a series' hue is assigned by POSITION and never
// cycled, so it is a value the caller already holds and not one of the palette's
// semantic steps.

import { createContext, type ReactNode, useContext } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import type { ColorValue } from '#ui/core';

const DOT = 9;

const LegendContext = createContext(false);

function useLegend(part: string): void {
  const inside = useContext(LegendContext);
  if (!inside) throw new Error(`<Legend.${part}> must be used inside <Legend.Root>`);
}

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
  /** Sugar for the name beside the dot; `children` say it when it is not a
   *  plain string. */
  label?: string;
  children?: ReactNode;
}

/** One entry: the dot and what it stands for. The dot is a face and never a
 *  control - a legend reports, it does not filter. */
function Item({ color, label, children }: Readonly<LegendItemProps>) {
  useLegend('Item');
  return (
    <Box row align="center" gap={7}>
      <Box w={DOT} h={DOT} shrink={0} radius="circle" bg={color} />
      <Text variant="meta" color="textMuted">
        {label ?? children}
      </Text>
    </Box>
  );
}

/**
 * The key to a chart's colours.
 *
 * ```tsx
 * <Legend.Root>
 *   <Legend.Item color={CHART_SERIES.films} label="Films" />
 *   <Legend.Item color={CHART_SERIES.tv} label="Series" />
 * </Legend.Root>
 * ```
 */
const Legend = { Root, Item };

export type { LegendItemProps, LegendRootProps };
export { Legend };
