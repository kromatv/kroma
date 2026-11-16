import { Row } from '@kromatv/ui/kit/atoms/box';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { SaveStatus } from '#site/lib/use-message-save.hook';

/** Whether a message's last edit is saved, or why it was not. */
export function SaveState({ status }: Readonly<{ status: SaveStatus }>) {
  if (status.kind === 'idle') {
    return null;
  }
  const failed = status.kind === 'failed';
  return (
    <Row gap={6} align="flex-start" accessibilityLiveRegion="polite" ml="auto">
      <Icon
        name={failed ? 'alert-circle' : 'check'}
        size={15}
        color={failed ? 'danger' : 'success'}
      />
      <Text variant="meta" color={failed ? 'danger' : 'success'}>
        {failed ? status.message : 'Saved'}
      </Text>
    </Row>
  );
}
