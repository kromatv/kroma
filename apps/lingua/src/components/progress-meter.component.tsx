import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Progress } from '@kromatv/ui/kit/atoms/progress';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { completion } from '#site/lib/completion';
import type { Progress as Done } from '#site/lib/views';

/** A language's progress bar, with its percentage and how many messages that is. */
export function ProgressMeter({ progress, label }: Readonly<{ progress: Done; label: string }>) {
  const { ratio, percent, complete } = completion(progress);
  return (
    <Column gap={6} w="100%">
      <Progress value={ratio} thickness={6} color={complete ? 'success' : 'accent'} label={label} />
      <Row gap={8} between>
        <Text variant="meta" color={complete ? 'success' : 'text'}>
          {`${percent}%`}
        </Text>
        <Text variant="meta" color="textDim">
          {`${progress.done} / ${progress.total}`}
        </Text>
      </Row>
    </Column>
  );
}
