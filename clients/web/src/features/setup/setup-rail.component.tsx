import { useT } from '@kromatv/ui';
import { Stepper } from '@kromatv/ui/kit';
import {
  answeredSteps,
  isSetupStep,
  type SetupStart,
  type SetupStep,
  stepsBehind,
} from '#web/features/setup/setup-steps';

const STEP_NAME = {
  language: 'setup.stepLanguage',
  start: 'setup.stepStart',
  owner: 'setup.stepOwner',
  import: 'setup.stepImport',
  media: 'setup.stepMedia',
  modules: 'setup.stepModules',
  people: 'setup.stepPeople',
  privacy: 'setup.stepPrivacy',
  done: 'setup.stepDone',
} as const satisfies Record<SetupStep, string>;

const STEP_ICON = {
  language: 'world',
  start: 'sparkles',
  owner: 'user',
  import: 'arrows-exchange',
  media: 'folder',
  modules: 'download',
  people: 'users',
  privacy: 'shield-check',
  done: 'check',
} as const satisfies Record<SetupStep, string>;

interface RailProps {
  step: SetupStep;
  /** The furthest step the owner has been to. */
  reached: SetupStep;
  /** The steps a press may go to. */
  open: readonly SetupStep[];
  /** How the setup began, which decides its steps. */
  start: SetupStart;
  onStep: (step: SetupStep) => void;
}

function RailStep({ name, disabled }: Readonly<{ name: SetupStep; disabled: boolean }>) {
  const t = useT();
  return (
    <Stepper.Item value={name} icon={STEP_ICON[name]} disabled={disabled}>
      <Stepper.Label>{t(STEP_NAME[name])}</Stepper.Label>
    </Stepper.Item>
  );
}

/** Every step by name, down the side of a wide screen: what is done, where the
 * owner is, and what comes next. Every step the owner has been to is one press
 * away, whichever one they are on. */
export function SetupRail({ step, reached, open, start, onStep }: Readonly<RailProps>) {
  const t = useT();
  const go = (next: string) => {
    if (isSetupStep(next)) {
      onStep(next);
    }
  };
  return (
    <Stepper.Root
      key={start}
      label={t('setup.railLabel')}
      orientation="vertical"
      size="sm"
      value={step}
      complete={stepsBehind(reached, start)}
      open={[reached]}
      onValueChange={go}
    >
      <Stepper.List>
        {answeredSteps(start).map((name) => (
          <RailStep key={name} name={name} disabled={name !== step && !open.includes(name)} />
        ))}
      </Stepper.List>
    </Stepper.Root>
  );
}

/** Where the owner is, for the line over the question on a screen with no
 * room for the list of steps. */
export function useStepPosition(step: SetupStep, start: SetupStart) {
  const t = useT();
  const steps = answeredSteps(start);
  return { position: steps.indexOf(step) + 1, count: steps.length, name: t(STEP_NAME[step]) };
}
