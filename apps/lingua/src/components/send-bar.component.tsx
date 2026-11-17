import { styles, useStyles } from '@kromatv/ui/kit';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { IconWell } from '@kromatv/ui/kit/atoms/icon-well';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { ReactNode } from 'react';
import { OutsideLink } from '#site/components/outside-link.component';
import {
  type SendBarActions,
  sendLabel,
  sendStatus,
  type Work,
  worthShowing,
} from '#site/lib/send-status';

const sDefinition = styles({
  dock: { position: 'sticky', bottom: 0, zIndex: 10, paddingBottom: 12, paddingTop: 4 },
});

function Dock({ children }: Readonly<{ children: ReactNode }>) {
  const s = useStyles(sDefinition);
  return (
    <Box style={s.dock}>
      <Row
        gap={12}
        wrap
        between
        align="center"
        p={12}
        radius="xl"
        bg="surface2"
        border="borderStrong"
        shadow="pop"
      >
        {children}
      </Row>
    </Box>
  );
}

function Status({ work }: Readonly<{ work: Work }>) {
  const status = sendStatus(work);
  return (
    <Row gap={12} align="center" grow={1} shrink={1} basis={240} minW={0}>
      <IconWell name="git-pull-request" size="sm" tone={work.drafts > 0 ? 'accent' : 'neutral'} />
      <Column gap={2} shrink={1} minW={0} accessibilityLiveRegion="polite">
        <Text variant="label" color={status.tone}>
          {status.title}
        </Text>
        <Text variant="meta" color="textDim">
          {status.detail}
        </Text>
      </Column>
    </Row>
  );
}

function PullRequestLink({ work }: Readonly<{ work: Work }>) {
  if (!work.proposal) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="external-link"
      label={`#${work.proposal.number}`}
      asChild
    >
      <OutsideLink to={work.proposal.url} />
    </Button>
  );
}

function Actions({ work, act }: Readonly<{ work: Work; act: SendBarActions }>) {
  return (
    <Row gap={8} wrap ml="auto">
      <PullRequestLink work={work} />
      {work.drafts > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          label="Discard"
          loading={act.discarding}
          onPress={act.onDiscard}
        />
      ) : null}
      <Button
        size="sm"
        icon="send"
        label={sendLabel(work)}
        disabled={work.drafts === 0}
        loading={work.sending.kind === 'sending'}
        onPress={act.onSend}
      />
    </Row>
  );
}

/** The viewer's work in one language, pinned under the page once there is any: how much is unsent, the pull request it rides in, and the buttons that send it or throw it away. */
export function SendBar({ work, act }: Readonly<{ work: Work; act: SendBarActions }>) {
  if (!worthShowing(work)) {
    return null;
  }
  return (
    <Dock>
      <Status work={work} />
      <Actions work={work} act={act} />
    </Dock>
  );
}
