import { Children, isValidElement, type ReactNode, useMemo, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Surface } from '#ui/components/atoms/surface';
import { styles, useBreakpoint } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { useEntryDefaults } from '#ui/lib/field-shell';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope.component';
import { Aside, Footer, Header, Hint, Panel, Status } from './guided-flow-bands.component';
import { GuidedFlowContext, PAD } from './guided-flow-context';
import { Actions, Next, Previous, Subtitle, Title } from './guided-flow-parts.component';

const COLUMN = 540;
const ASIDE = 248;
const HEIGHT = 720;
const ROOMY = 600;

const sDefinition = styles({
  room: { flex: 1, minH: 0, w: '100%' },
  frame: { row: true, flex: 1, minH: 0, minW: 0 },
  aside: { w: ASIDE, grow: 0, shrink: 0, bg: 'bg' },
  asideBand: { p: 24 },
  main: { flex: 1, minH: 0, minW: 0 },
});

type Frame = Pick<BoxProps, 'w' | 'maxW' | 'h' | 'maxH' | 'flex' | 'minH'>;

interface Room {
  roomy: boolean;
  aside: boolean;
}

function frameOf({ roomy, aside }: Room): Frame {
  if (!roomy) {
    return { flex: true, minH: 0 };
  }
  return { w: '100%', maxW: COLUMN + (aside ? ASIDE : 0), h: HEIGHT, maxH: '100%' };
}

function isPart(child: ReactNode, part: unknown): boolean {
  return isValidElement(child) && child.type === part;
}

function shownParts({ children, roomy }: Readonly<{ children: ReactNode; roomy: boolean }>) {
  const all = Children.toArray(children);
  const aside = roomy ? all.filter((child) => isPart(child, Aside)) : [];
  const drawn = aside.length > 0;
  const main = all.filter((child) => !isPart(child, Aside) && !(drawn && isPart(child, Status)));
  return { aside, main };
}

function AsideColumn({ aside }: Readonly<{ aside: readonly ReactNode[] }>) {
  const s = useStyles(sDefinition);
  if (aside.length === 0) {
    return null;
  }
  return (
    <>
      <ScrollView style={s.aside} contentContainerStyle={s.asideBand}>
        {aside}
      </ScrollView>
      <Box w={1} bg="border" />
    </>
  );
}

interface GuidedFlowRootProps {
  /** Names the screen to assistive tech: the flow it is one step of. */
  label: string;
  /** The screen's parts: a `<GuidedFlow.Header>`, `<GuidedFlow.Panel>` and
   *  `<GuidedFlow.Footer>`, and a `<GuidedFlow.Aside>` or a
   *  `<GuidedFlow.Status>` for where the flow is. Only a DIRECT Aside or
   *  Status is sorted, so those two are written here and not in a component
   *  of your own. */
  children?: ReactNode;
  /** Where the frame sits in the room it is given. In less than 600 points it
   *  fills that room; in more it is one column of one height, which this
   *  places. Until the room is measured, the screen's breakpoint stands in. */
  style?: StyleProp<ViewStyle>;
}

function useRoomy() {
  const guess = useBreakpoint() !== 'base';
  const [width, setWidth] = useState<number | null>(null);
  const measure = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return { roomy: width === null ? guess : width >= ROOMY, measure };
}

function Root({ label, children, style }: Readonly<GuidedFlowRootProps>) {
  const s = useStyles(sDefinition);
  const { size } = useEntryDefaults();
  const { roomy, measure } = useRoomy();
  const { aside, main } = shownParts({ children, roomy });
  const pad = roomy ? PAD.roomy : PAD.narrow;
  const state = useMemo(() => ({ size, pad }), [size, pad]);
  return (
    <GuidedFlowContext.Provider value={state}>
      <Box style={s.room} onLayout={measure}>
        <Surface
          elevated
          pad="none"
          row
          overflow="hidden"
          role="region"
          accessibilityLabel={label}
          {...frameOf({ roomy, aside: aside.length > 0 })}
          style={style}
        >
          <FocusRegion style={s.frame}>
            <AsideColumn aside={aside} />
            <FocusColumn style={s.main}>{main}</FocusColumn>
          </FocusRegion>
        </Surface>
      </Box>
    </GuidedFlowContext.Provider>
  );
}

/**
 * One screen of a guided flow: one question, how far along the flow is, a way
 * back, a way forward and a secondary action. The header and the footer stay
 * in view and only the panel scrolls, so the page itself never does.
 *
 * ```tsx
 * <GuidedFlow.Root label="Configuration">
 *   <GuidedFlow.Status position={2} count={6}>Point de départ</GuidedFlow.Status>
 *   <GuidedFlow.Header>
 *     <GuidedFlow.Title>Par où commencer ?</GuidedFlow.Title>
 *   </GuidedFlow.Header>
 *   <GuidedFlow.Panel>…</GuidedFlow.Panel>
 *   <GuidedFlow.Footer>
 *     <GuidedFlow.Previous onPress={back} />
 *     <GuidedFlow.Actions>
 *       <Button variant="ghost" label="Passer cette étape" onPress={skip} />
 *       <GuidedFlow.Next onPress={next} />
 *     </GuidedFlow.Actions>
 *   </GuidedFlow.Footer>
 * </GuidedFlow.Root>
 * ```
 */
const GuidedFlow = {
  Root,
  Aside,
  Status,
  Header,
  Title,
  Subtitle,
  Panel,
  Footer,
  Hint,
  Previous,
  Actions,
  Next,
};

export type { GuidedFlowBandProps, GuidedFlowStatusProps } from './guided-flow-bands.component';
export type { GuidedFlowMoveProps } from './guided-flow-parts.component';
export type { GuidedFlowRootProps };
export { GuidedFlow };
