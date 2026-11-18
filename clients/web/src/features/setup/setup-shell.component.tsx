import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  classes,
  Logo,
  Row,
  Surface,
  styles,
  Text,
  useBreakpoint,
  useStyles,
} from '@kromatv/ui/kit';
import type { CSSProperties, ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { SetupProgress, SetupRail } from '#web/features/setup/setup-rail.component';
import { SetupStage } from '#web/features/setup/setup-stage.component';
import { canSkip, type SetupStep } from '#web/features/setup/setup-steps';
import { useWallPosters } from '#web/features/setup/use-wall-posters.hook';
import { PosterWall } from '#web/shared/ui/poster-wall.component';

const CARD = 540;
const RAIL = 248;
const CARD_HEIGHT = 720;
const GUTTER = 48;
const STAGE_ROOM = 520;
const PAD = { base: 20, md: 36 } as const;
const EDGE = 14;

const FADES: CSSProperties = {
  maskImage: `linear-gradient(to bottom, transparent, #000 ${EDGE}px, #000 calc(100% - ${EDGE}px), transparent)`,
};

const sDefinition = styles({
  screen: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    overflow: 'hidden',
    bg: 'bg',
  },
  shade: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
    backgroundImage:
      'radial-gradient(52% 46% at 100% 100%, color-mix(in srgb, var(--kroma-bg) 94%, transparent) 0%, color-mix(in srgb, var(--kroma-bg) 70%, transparent) 45%, transparent 100%), linear-gradient(90deg, var(--kroma-bg) 0%, color-mix(in srgb, var(--kroma-bg) 92%, transparent) 34%, color-mix(in srgb, var(--kroma-bg) 52%, transparent) 68%, color-mix(in srgb, var(--kroma-bg) 30%, transparent) 100%), linear-gradient(180deg, color-mix(in srgb, var(--kroma-bg) 80%, transparent) 0%, transparent 22%)',
  },
  layer: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: RAIL,
    padding: 24,
    overflowY: 'auto',
    bg: 'bg',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    animationKeyframes: 'fade-in',
    animationDuration: 'var(--dur-slow)',
    animationTimingFunction: 'var(--ease-out)',
    animationFillMode: 'both',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    gap: 20,
    paddingBlock: EDGE,
    paddingInline: PAD.md,
    overflowY: 'auto',
  },
  bodyNarrow: { paddingInline: PAD.base },
  foot: { borderTopWidth: 1, borderTopColor: 'border' },
});

interface ShellProps {
  step: SetupStep;
  /** The furthest step the owner has been to. */
  reached: SetupStep;
  /** The steps the list down the side may go to. */
  open: readonly SetupStep[];
  /** The library's own posters, the newest first, for the wall behind. */
  posters: readonly string[];
  onStep: (step: SetupStep) => void;
  onFinishLater: () => void;
  children: ReactNode;
}

type CardProps = Pick<ShellProps, 'step' | 'reached' | 'open' | 'onStep' | 'children'>;

function ShellHeader({
  step,
  onFinishLater,
}: Readonly<Pick<ShellProps, 'step' | 'onFinishLater'>>) {
  const t = useT();
  return (
    <Row between align="center" px={{ base: 16, md: GUTTER }} py={{ base: 16, md: 28 }} gap={12}>
      <Logo size={26} />
      {canSkip(step) ? (
        <Button variant="scrim" size="sm" label={t('setup.finishLater')} onPress={onFinishLater} />
      ) : null}
    </Row>
  );
}

function NarrowCard({ step, children }: Readonly<Pick<CardProps, 'step' | 'children'>>) {
  const s = useStyles(sDefinition);
  return (
    <Box flex minH={0} px={12} pb={12}>
      <Surface elevated pad="none" flex minH={0} overflow="hidden">
        {step === 'done' ? null : (
          <Box px={PAD.base} pt={PAD.base}>
            <SetupProgress step={step} />
          </Box>
        )}
        <div key={step} className={classes(s.step)}>
          {children}
        </div>
      </Surface>
    </Box>
  );
}

function RailSide({ step, reached, open, onStep }: Readonly<Omit<CardProps, 'children'>>) {
  const s = useStyles(sDefinition);
  return (
    <>
      <div className={classes(s.rail)}>
        <SetupRail step={step} reached={reached} open={open} onStep={onStep} />
      </div>
      <Box w={1} bg="border" />
    </>
  );
}

function WideCard({ step, reached, open, onStep, children }: Readonly<CardProps>) {
  const s = useStyles(sDefinition);
  const railed = step !== 'done';
  return (
    <Row flex minH={0} px={GUTTER} pb={GUTTER}>
      <Surface
        elevated
        pad="none"
        row
        w="100%"
        maxW={railed ? RAIL + CARD : CARD}
        h={CARD_HEIGHT}
        maxH="100%"
        my="auto"
        overflow="hidden"
      >
        {railed ? <RailSide step={step} reached={reached} open={open} onStep={onStep} /> : null}
        <div key={step} className={classes(s.step)}>
          {children}
        </div>
      </Surface>
    </Row>
  );
}

function ShellBackdrop({ step, posters }: Readonly<Pick<ShellProps, 'step' | 'posters'>>) {
  const s = useStyles(sDefinition);
  const wall = useWallPosters(posters);
  const staged = useWindowDimensions().width >= GUTTER + RAIL + CARD + STAGE_ROOM;
  return (
    <>
      <PosterWall posters={wall} />
      <div className={classes(s.shade)} />
      {staged ? <SetupStage step={step} /> : null}
    </>
  );
}

/** The frame every screen of the guided setup sits in. A wall of artwork
 * moves behind it, and over the wall is one card of one height: the list of
 * steps, and the question the owner is on. The page never scrolls. A step is
 * a <StepHeading>, a <StepBody> and a <StepActions>, and only the body
 * scrolls, between the other two. */
export function SetupShell({
  step,
  reached,
  open,
  posters,
  onStep,
  onFinishLater,
  children,
}: Readonly<ShellProps>) {
  const s = useStyles(sDefinition);
  const narrow = useBreakpoint() === 'base';
  return (
    <main className={classes(s.screen)}>
      <ShellBackdrop step={step} posters={posters} />
      <div className={classes(s.layer)}>
        <ShellHeader step={step} onFinishLater={onFinishLater} />
        {narrow ? (
          <NarrowCard step={step}>{children}</NarrowCard>
        ) : (
          <WideCard step={step} reached={reached} open={open} onStep={onStep}>
            {children}
          </WideCard>
        )}
      </div>
    </main>
  );
}

/** What a step asks: its title and the one sentence under it. It stays at the
 * head of the card. Its children stay there with it: a search field over a
 * long list. */
export function StepHeading({
  title,
  sub,
  children,
}: Readonly<{ title: string; sub: string; children?: ReactNode }>) {
  return (
    <Box gap={12} px={PAD} pt={{ base: 20, md: 36 }} pb={8} shrink={0}>
      <Text variant="h1" accessibilityRole="header">
        {title}
      </Text>
      <Text color="textMuted">{sub}</Text>
      {children}
    </Box>
  );
}

/** What a step holds between its heading and its actions. It is the one part
 * of the card that scrolls. */
export function StepBody({ children }: Readonly<{ children: ReactNode }>) {
  const s = useStyles(sDefinition);
  const narrow = useBreakpoint() === 'base';
  return (
    <div className={classes(s.body, narrow && s.bodyNarrow)} style={FADES}>
      {children}
    </div>
  );
}

interface ActionsProps {
  onBack?: () => void;
  /** One line over the actions: what pressing forward will do. */
  note?: ReactNode;
  children: ReactNode;
}

function BackAction({ onBack }: Readonly<Pick<ActionsProps, 'onBack'>>) {
  const t = useT();
  if (!onBack) {
    return <Box />;
  }
  return (
    <Button
      variant="ghost"
      size="md"
      icon="chevron-left"
      label={t('common.back')}
      onPress={onBack}
    />
  );
}

/** The actions that end a step: the way back on the left, the way forward on
 * the right. They stay at the foot of the card. */
export function StepActions({ onBack, note, children }: Readonly<ActionsProps>) {
  const s = useStyles(sDefinition);
  return (
    <Box gap={12} px={PAD} py={16} shrink={0} style={s.foot}>
      {note}
      <Row between align="center" gap={12}>
        <BackAction onBack={onBack} />
        <Row align="center" gap={8}>
          {children}
        </Row>
      </Row>
    </Box>
  );
}
