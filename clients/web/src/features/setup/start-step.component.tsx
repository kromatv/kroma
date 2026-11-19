import { useT } from '@kromatv/ui';
import { Button, ChoiceList } from '@kromatv/ui/kit';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { isSetupStart, type SetupStart } from '#web/features/setup/setup-steps';

interface StartProps {
  start: SetupStart;
  onStart: (start: SetupStart) => void;
  onBack: () => void;
  onContinue: () => void;
}

function StartChoice({ start, onStart }: Readonly<Pick<StartProps, 'start' | 'onStart'>>) {
  const t = useT();
  const choose = (value: string) => {
    if (isSetupStart(value)) {
      onStart(value);
    }
  };
  return (
    <ChoiceList.Root size="md" label={t('setup.startTitle')} value={start} onValueChange={choose}>
      <ChoiceList.Item value="fresh">
        <ChoiceList.Label>{t('setup.startFresh')}</ChoiceList.Label>
        <ChoiceList.Hint>{t('setup.startFreshHint')}</ChoiceList.Hint>
      </ChoiceList.Item>
      <ChoiceList.Item value="bring">
        <ChoiceList.Label>{t('setup.startBring')}</ChoiceList.Label>
        <ChoiceList.Hint>{t('setup.startBringHint')}</ChoiceList.Hint>
      </ChoiceList.Item>
    </ChoiceList.Root>
  );
}

/** One choice, which only decides the screens that follow: an empty library,
 * or the household of another media server. */
export function StartStep({ start, onStart, onBack, onContinue }: Readonly<StartProps>) {
  const t = useT();
  return (
    <>
      <StepHeading title={t('setup.startTitle')} sub={t('setup.startSub')} />
      <StepBody>
        <StartChoice start={start} onStart={onStart} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          onPress={onContinue}
        />
      </StepActions>
    </>
  );
}
