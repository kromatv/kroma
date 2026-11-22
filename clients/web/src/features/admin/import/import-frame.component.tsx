import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Divider,
  GuidedFlow,
  type GuidedFlowMoveProps,
  Row,
  Surface,
  Text,
} from '@kromatv/ui/kit';
import { createContext, type ReactNode, useContext } from 'react';

type Band = Readonly<{ children?: ReactNode }>;
type Line = Readonly<{ children: ReactNode }>;
type Move = Readonly<GuidedFlowMoveProps>;

const PAD = { base: 20, md: 28 } as const;

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

function ConsolePrevious({ label, ...press }: Move) {
  const t = useT();
  return (
    <Button variant="ghost" icon="chevron-left" {...press} label={label ?? t('common.back')} />
  );
}

function ConsoleNext({ label, ...press }: Move) {
  const t = useT();
  return <Button iconRight="arrow-right" {...press} label={label ?? t('flow.continue')} />;
}

function Header({ children }: Band) {
  const inConsole = useContext(InConsole);
  return inConsole ? (
    <ConsoleHeader>{children}</ConsoleHeader>
  ) : (
    <GuidedFlow.Header>{children}</GuidedFlow.Header>
  );
}

function Title({ children }: Line) {
  const inConsole = useContext(InConsole);
  return inConsole ? (
    <ConsoleTitle>{children}</ConsoleTitle>
  ) : (
    <GuidedFlow.Title>{children}</GuidedFlow.Title>
  );
}

function Subtitle({ children }: Line) {
  const inConsole = useContext(InConsole);
  return inConsole ? (
    <ConsoleSubtitle>{children}</ConsoleSubtitle>
  ) : (
    <GuidedFlow.Subtitle>{children}</GuidedFlow.Subtitle>
  );
}

function Panel({ children }: Band) {
  const inConsole = useContext(InConsole);
  return inConsole ? (
    <ConsolePanel>{children}</ConsolePanel>
  ) : (
    <GuidedFlow.Panel>{children}</GuidedFlow.Panel>
  );
}

function Footer({ children }: Band) {
  const inConsole = useContext(InConsole);
  return inConsole ? (
    <ConsoleFooter>{children}</ConsoleFooter>
  ) : (
    <GuidedFlow.Footer>{children}</GuidedFlow.Footer>
  );
}

function Actions({ children }: Band) {
  const inConsole = useContext(InConsole);
  return inConsole ? (
    <ConsoleActions>{children}</ConsoleActions>
  ) : (
    <GuidedFlow.Actions>{children}</GuidedFlow.Actions>
  );
}

function Previous(props: Move) {
  const inConsole = useContext(InConsole);
  return inConsole ? <ConsolePrevious {...props} /> : <GuidedFlow.Previous {...props} />;
}

function Next(props: Move) {
  const inConsole = useContext(InConsole);
  return inConsole ? <ConsoleNext {...props} /> : <GuidedFlow.Next {...props} />;
}

/** The parts an import screen is written in. Inside a `GuidedFlow.Root`, as
 * the setup draws them, they are the guided flow's own; inside a
 * `<ConsoleFrame>` they lay the screen out in the admin console's card. */
export const ImportFrame = { Header, Title, Subtitle, Panel, Footer, Previous, Actions, Next };

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
