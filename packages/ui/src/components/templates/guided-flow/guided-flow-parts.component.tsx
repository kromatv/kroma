import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { useTDefault } from '#ui/services/i18n';
import { useGuidedFlowPart } from './guided-flow-context';

/** The question the screen asks. It is the screen's heading. */
function Title({ children }: Readonly<{ children: ReactNode }>) {
  useGuidedFlowPart('Title');
  return (
    <Text variant="h1" accessibilityRole="header">
      {children}
    </Text>
  );
}

/** One sentence under the question, where the question alone is not enough. */
function Subtitle({ children }: Readonly<{ children: ReactNode }>) {
  useGuidedFlowPart('Subtitle');
  return <Text color="textMuted">{children}</Text>;
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

/** The way back, at the start of the footer. Leave it out on the first
 *  screen: the actions keep their place at the end. */
function Previous({ onPress, label, disabled, loading }: Readonly<GuidedFlowMoveProps>) {
  const { size } = useGuidedFlowPart('Previous');
  const t = useTDefault();
  return (
    <Button
      variant="ghost"
      size={size}
      icon="chevron-left"
      label={label ?? t('common.back')}
      disabled={disabled}
      loading={loading}
      onPress={onPress}
    />
  );
}

/** The way forward: the screen's one accent action, last in its row. */
function Next({ onPress, label, disabled, loading }: Readonly<GuidedFlowMoveProps>) {
  const { size } = useGuidedFlowPart('Next');
  const t = useTDefault();
  return (
    <Button
      size={size}
      iconRight="arrow-right"
      label={label ?? t('flow.continue')}
      disabled={disabled}
      loading={loading}
      onPress={onPress}
    />
  );
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
