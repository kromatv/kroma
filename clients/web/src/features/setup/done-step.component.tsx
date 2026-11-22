import { useT } from '@kromatv/ui';
import { GuidedFlow } from '@kromatv/ui/kit';

/** The last screen: nothing left to answer, and the way into the library. */
export function DoneStep({ onOpen }: Readonly<{ onOpen: () => void }>) {
  const t = useT();
  return (
    <>
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.doneTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.doneSub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>{null}</GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Actions>
          <GuidedFlow.Next label={t('setup.doneOpen')} onPress={onOpen} />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </>
  );
}
