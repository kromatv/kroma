import { useT } from '@kromatv/ui';
import { Button } from '@kromatv/ui/kit';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';

/** The last screen: nothing left to answer, and the way into the library. */
export function DoneStep({ onOpen }: Readonly<{ onOpen: () => void }>) {
  const t = useT();
  return (
    <>
      <StepHeading title={t('setup.doneTitle')} sub={t('setup.doneSub')} />
      <StepBody>{null}</StepBody>
      <StepActions>
        <Button size="md" label={t('setup.doneOpen')} iconRight="arrow-right" onPress={onOpen} />
      </StepActions>
    </>
  );
}
