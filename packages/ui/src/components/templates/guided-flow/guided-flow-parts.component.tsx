import type { MessageKey } from '@kromatv/i18n';
import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button, type ButtonProps } from '#ui/components/atoms/button';
import { Text, type TextProps } from '#ui/components/atoms/text';
import { useTDefault } from '#ui/services/i18n';
import { useGuidedFlowPart } from './guided-flow-context';

const LINE = {
  Title: { variant: 'h1', accessibilityRole: 'header' },
  Subtitle: { color: 'textMuted' },
} as const satisfies Record<string, TextProps>;

function HeadingLine({
  part,
  children,
}: Readonly<{ part: keyof typeof LINE; children: ReactNode }>) {
  useGuidedFlowPart(part);
  return <Text {...LINE[part]}>{children}</Text>;
}

/** The question the screen asks. It is the screen's heading. */
function Title({ children }: Readonly<{ children: ReactNode }>) {
  return <HeadingLine part="Title">{children}</HeadingLine>;
}

/** One sentence under the question, where the question alone is not enough. */
function Subtitle({ children }: Readonly<{ children: ReactNode }>) {
  return <HeadingLine part="Subtitle">{children}</HeadingLine>;
}

interface GuidedFlowMoveProps {
  onPress?: () => void;
  /** The word on the button, which is also its accessible name. Defaults to
   *  `Back` and `Continue`, in the screen's language. */
  label?: string;
  disabled?: boolean;
  /** The work this press started is running: the button spins and takes no
   *  other press. */
  loading?: boolean;
}

const MOVE = {
  Previous: { face: { variant: 'ghost', icon: 'chevron-left' }, word: 'common.back' },
  Next: { face: { iconRight: 'arrow-right' }, word: 'flow.continue' },
} as const satisfies Record<string, { face: Partial<ButtonProps>; word: MessageKey }>;

function Move({
  part,
  label,
  ...press
}: Readonly<GuidedFlowMoveProps & { part: keyof typeof MOVE }>) {
  const { size } = useGuidedFlowPart(part);
  const t = useTDefault();
  const { face, word } = MOVE[part];
  return <Button {...face} {...press} size={size} label={label ?? t(word)} />;
}

/** The way back, at the start of the footer. Leave it out on the first
 *  screen: the actions keep their place at the end. */
function Previous(props: Readonly<GuidedFlowMoveProps>) {
  return <Move part="Previous" {...props} />;
}

/** The way forward: the screen's one accent action, last in its row. */
function Next(props: Readonly<GuidedFlowMoveProps>) {
  return <Move part="Next" {...props} />;
}

/** The end of the footer: a secondary action, such as skipping the screen,
 *  then the `<GuidedFlow.Next>`. */
function Actions({ children }: Readonly<{ children?: ReactNode }>) {
  useGuidedFlowPart('Actions');
  return (
    <Box row align="center" gap={8} ml="auto">
      {children}
    </Box>
  );
}

export type { GuidedFlowMoveProps };
export { Actions, Next, Previous, Subtitle, Title };
