import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  type ButtonProps,
  Divider,
  GuidedFlow,
  type GuidedFlowMoveProps,
  Row,
  Surface,
  Text,
} from '@kromatv/ui/kit';
import { type ComponentType, createContext, type ReactNode, useContext } from 'react';

type Band = Readonly<{ children?: ReactNode }>;
type Line = Readonly<{ children: ReactNode }>;
type Move = Readonly<GuidedFlowMoveProps>;

const PAD = { base: 20, md: 28 } as const;

const MOVE = {
  previous: { face: { variant: 'ghost', icon: 'chevron-left' }, word: 'common.back' },
  next: { face: { iconRight: 'arrow-right' }, word: 'flow.continue' },
} as const satisfies Record<string, { face: Partial<ButtonProps>; word: MessageKey }>;

const InConsole = createContext(false);

function ConsoleHeader({ children }: Band) {
  return (
    <Box gap={8} px={PAD} pt={PAD} pb={4}>
      {children}
    </Box>
  );
}

function ConsoleTitle({ children }: Line) {
  return (
    <Text variant="h2" accessibilityRole="header">
      {children}
    </Text>
  );
}

function ConsoleSubtitle({ children }: Line) {
  return <Text color="textMuted">{children}</Text>;
}

function ConsolePanel({ children }: Band) {
  return (
    <Box gap={20} px={PAD} py={20}>
      {children}
    </Box>
  );
}

function ConsoleFooter({ children }: Band) {
  return (
    <>
      <Divider />
      <Row align="center" gap={12} px={PAD} py={16}>
        {children}
      </Row>
    </>
  );
}

function ConsoleActions({ children }: Band) {
  return (
    <Row align="center" gap={8} ml="auto">
      {children}
    </Row>
  );
}

function consoleMove(way: keyof typeof MOVE) {
  return function ConsoleMove({ label, ...press }: Move) {
    const t = useT();
    const { face, word } = MOVE[way];
    return <Button {...face} {...press} label={label ?? t(word)} />;
  };
}

function framed<P extends object>(ConsolePart: ComponentType<P>, GuidedPart: ComponentType<P>) {
  return function FramePart(props: P) {
    return useContext(InConsole) ? <ConsolePart {...props} /> : <GuidedPart {...props} />;
  };
}

/** The parts an import screen is written in. Inside a `GuidedFlow.Root`, as
 * the setup draws them, they are the guided flow's own; inside a
 * `<ConsoleFrame>` they lay the screen out in the admin console's card. */
export const ImportFrame = {
  Header: framed(ConsoleHeader, GuidedFlow.Header),
  Title: framed(ConsoleTitle, GuidedFlow.Title),
  Subtitle: framed(ConsoleSubtitle, GuidedFlow.Subtitle),
  Panel: framed(ConsolePanel, GuidedFlow.Panel),
  Footer: framed(ConsoleFooter, GuidedFlow.Footer),
  Previous: framed(consoleMove('previous'), GuidedFlow.Previous),
  Actions: framed(ConsoleActions, GuidedFlow.Actions),
  Next: framed(consoleMove('next'), GuidedFlow.Next),
};

/** One import screen in the admin console: a card as wide as the room it is
 * given and as tall as what it holds, so the page scrolls rather than the
 * screen. */
export function ConsoleFrame({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <InConsole.Provider value>
      <Surface pad="none" role="region" accessibilityLabel={label}>
        {children}
      </Surface>
    </InConsole.Provider>
  );
}
