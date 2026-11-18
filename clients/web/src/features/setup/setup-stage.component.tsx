import { useT } from '@kromatv/ui';
import { classes, styles, Text, useStyles } from '@kromatv/ui/kit';
import type { SetupStep } from '#web/features/setup/setup-steps';

const STAGE_LINE = {
  language: 'setup.stageLanguage',
  start: 'setup.stageStart',
  owner: 'setup.stageOwner',
  media: 'setup.stageMedia',
  modules: 'setup.stageModules',
  people: 'setup.stagePeople',
  privacy: 'setup.stagePrivacy',
  done: 'setup.stageDone',
} as const satisfies Record<SetupStep, string>;

const sDefinition = styles({
  words: {
    position: 'absolute',
    right: 64,
    bottom: 72,
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 14,
    maxWidth: 400,
    pointerEvents: 'none',
    animationKeyframes: 'fade-in',
    animationDuration: 'var(--dur-slow)',
    animationTimingFunction: 'var(--ease-out)',
    animationFillMode: 'both',
  },
});

/** One line over the wall, on a wide screen, that says what the step beside
 * it is for. */
export function SetupStage({ step }: Readonly<{ step: SetupStep }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <div key={step} className={classes(s.words)}>
      <Text variant="overline" color="white/60" textAlign="right">
        {t('setup.stageEyebrow')}
      </Text>
      <Text variant="h1" color="white" textAlign="right">
        {t(STAGE_LINE[step])}
      </Text>
    </div>
  );
}
