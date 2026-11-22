import { useT } from '@kromatv/ui';
import { Box, Button, classes, GuidedFlow, Logo, Row, styles, useStyles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { SetupRail, useStepPosition } from '#web/features/setup/setup-rail.component';
import { SetupStage } from '#web/features/setup/setup-stage.component';
import { canSkip, type SetupStart, type SetupStep } from '#web/features/setup/setup-steps';
import { useWallPosters } from '#web/features/setup/use-wall-posters.hook';
import { PosterWall } from '#web/shared/ui/poster-wall.component';

const CARD = 540;
const RAIL = 248;
const GUTTER = 48;
const STAGE_ROOM = 520;

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
  card: { my: 'auto' },
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
});

interface ShellProps {
  step: SetupStep;
  /** How the setup began, which decides its steps. */
  start: SetupStart;
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

type CardProps = Pick<ShellProps, 'step' | 'start' | 'reached' | 'open' | 'onStep' | 'children'>;

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

function SetupCard({ children, ...rail }: Readonly<CardProps>) {
  const t = useT();
  const s = useStyles(sDefinition);
  const where = useStepPosition(rail.step, rail.start);
  const listed = rail.step !== 'done';
  return (
    <Box flex minH={0} px={{ base: 12, md: GUTTER }} pb={{ base: 12, md: GUTTER }}>
      <GuidedFlow.Root label={t('setup.railLabel')} style={s.card}>
        {listed ? (
          <GuidedFlow.Aside>
            <SetupRail {...rail} />
          </GuidedFlow.Aside>
        ) : null}
        {listed ? (
          <GuidedFlow.Status position={where.position} count={where.count}>
            {where.name}
          </GuidedFlow.Status>
        ) : null}
        <div key={rail.step} className={classes(s.step)}>
          {children}
        </div>
      </GuidedFlow.Root>
    </Box>
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

/** The frame every screen of the guided setup sits in: one card over a wall
 * of artwork that moves behind it. The card is the kit's `GuidedFlow`, so a
 * step is its header, its panel and its footer, and only the panel scrolls. */
export function SetupShell({ posters, onFinishLater, children, ...card }: Readonly<ShellProps>) {
  const s = useStyles(sDefinition);
  return (
    <main className={classes(s.screen)}>
      <ShellBackdrop step={card.step} posters={posters} />
      <div className={classes(s.layer)}>
        <ShellHeader step={card.step} onFinishLater={onFinishLater} />
        <SetupCard {...card}>{children}</SetupCard>
      </div>
    </main>
  );
}
