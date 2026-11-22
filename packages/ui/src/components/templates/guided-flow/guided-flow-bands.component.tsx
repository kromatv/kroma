import { Children, isValidElement, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Progress } from '#ui/components/atoms/progress';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { FocusRegion } from '#ui/lib/focus-scope.component';
import { nameOf } from '#ui/lib/name-of';
import { useTDefault } from '#ui/services/i18n';
import { useGuidedFlowPart } from './guided-flow-context';

const sDefinition = styles({
  panel: { flex: 1 },
  row: { row: true, align: 'center', justify: 'space-between', gap: 12 },
});

interface GuidedFlowBandProps {
  children?: ReactNode;
}

/** The pinned top of the screen: the question, and whatever must stay in view
 *  with it while the panel scrolls, such as a search field over a long list. */
function Header({ children }: Readonly<GuidedFlowBandProps>) {
  const { pad } = useGuidedFlowPart('Header');
  return (
    <Box shrink={0} gap={12} px={pad} pt={pad} pb={8}>
      {children}
    </Box>
  );
}

/** The scrolling middle, and the only part of the screen that scrolls. */
function Panel({ children }: Readonly<GuidedFlowBandProps>) {
  const { pad } = useGuidedFlowPart('Panel');
  const s = useStyles(sDefinition);
  return (
    <ScrollView style={s.panel}>
      <Box gap={20} px={pad} py={14}>
        {children}
      </Box>
    </ScrollView>
  );
}

/** One line over the actions: what going forward will do. */
function Hint({ children }: Readonly<{ children: ReactNode }>) {
  useGuidedFlowPart('Hint');
  if (typeof children !== 'string') {
    return <Box>{children}</Box>;
  }
  return (
    <Text variant="meta" color="textMuted">
      {children}
    </Text>
  );
}

function isHint(child: ReactNode): boolean {
  return isValidElement(child) && child.type === Hint;
}

function splitHints(children: ReactNode) {
  const all = Children.toArray(children);
  return { hints: all.filter(isHint), row: all.filter((child) => !isHint(child)) };
}

/** The pinned bottom: a `<GuidedFlow.Previous>` at the start and the
 *  `<GuidedFlow.Actions>` at the end, as one row for the remote. A direct
 *  `<GuidedFlow.Hint>` is drawn over that row. */
function Footer({ children }: Readonly<GuidedFlowBandProps>) {
  const { pad } = useGuidedFlowPart('Footer');
  const s = useStyles(sDefinition);
  const { hints, row } = splitHints(children);
  return (
    <>
      <Divider />
      <Box shrink={0} gap={12} px={pad} py={16}>
        {hints}
        <FocusRegion style={s.row}>{row}</FocusRegion>
      </Box>
    </>
  );
}

interface GuidedFlowStatusProps {
  /** One-based. */
  position: number;
  count: number;
  /** The step's name, said after its position. */
  children?: ReactNode;
}

/** How far along the flow is: `Step 2 of 6: Account` over a bar. Drawn only
 *  where the Root has no `<GuidedFlow.Aside>` to show instead. */
function Status({ position, count, children }: Readonly<GuidedFlowStatusProps>) {
  const { pad } = useGuidedFlowPart('Status');
  const t = useTDefault();
  const name = nameOf(children);
  const where = name
    ? t('flow.stepNamed', { position, count, name })
    : t('flow.step', { position, count });
  return (
    <Box shrink={0} gap={10} px={pad} pt={pad}>
      <Text variant="overline" color="textDim">
        {where}
      </Text>
      <Progress value={position / count} label={where} />
    </Box>
  );
}

/** What stands beside the question on a screen wide enough for it: the list
 *  of the flow's steps. Where there is no room it is not drawn, and the
 *  `<GuidedFlow.Status>` is drawn in its place. */
function Aside({ children }: Readonly<GuidedFlowBandProps>) {
  useGuidedFlowPart('Aside');
  return <>{children}</>;
}

export type { GuidedFlowBandProps, GuidedFlowStatusProps };
export { Aside, Footer, Header, Hint, Panel, Status };
