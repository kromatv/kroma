import { useT } from '@kromatv/ui';
import { ChoiceList, GuidedFlow } from '@kromatv/ui/kit';
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
    <ChoiceList.Root
      size="md"
      ground="surface"
      label={t('setup.startTitle')}
      value={start}
      onValueChange={choose}
    >
      <ChoiceList.Item value="fresh">
        <ChoiceList.Media name="sparkles" />
        <ChoiceList.Label>{t('setup.startFresh')}</ChoiceList.Label>
        <ChoiceList.Hint>{t('setup.startFreshHint')}</ChoiceList.Hint>
      </ChoiceList.Item>
      <ChoiceList.Item value="bring">
        <ChoiceList.Media name="arrows-exchange" />
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
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.startTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.startSub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <StartChoice start={start} onStart={onStart} />
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Previous onPress={onBack} />
        <GuidedFlow.Actions>
          <GuidedFlow.Next onPress={onContinue} />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </>
  );
}
