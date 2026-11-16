import { Row } from '@kromatv/ui/kit/atoms/box';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Spinner } from '@kromatv/ui/kit/atoms/spinner';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { SaveStatus } from '#site/lib/use-message-save.hook';

/** Whether a message's last edit is saving, saved, or why it was not. */
export function SaveState({ status }: Readonly<{ status: SaveStatus }>) {
  if (status.kind === 'idle') {
    return null;
  }
  if (status.kind === 'saving') {
    return (
      <Row gap={6} align="center">
        <Spinner size={14} />
        <Text variant="meta" color="textDim">
          Saving
        </Text>
      </Row>
    );
  }
  const failed = status.kind === 'failed';
  return (
    <Row gap={6} align="flex-start" accessibilityLiveRegion="polite">
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
