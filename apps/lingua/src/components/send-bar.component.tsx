import { styles, useStyles } from '@kromatv/ui/kit';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { ReactNode } from 'react';
import { counted } from '#site/lib/counted';
import { type Sending, type SendVia, useSending } from '#site/lib/use-sending.hook';
import type { ProposalView } from '#site/lib/views';

const sDefinition = styles({
  dock: { position: 'sticky', bottom: 0, zIndex: 10, paddingBottom: 16 },
});

function statusOf(
  sending: Sending,
  drafts: number,
): { text: string; tone: 'text' | 'textMuted' | 'danger' | 'success' } {
  if (sending.kind === 'failed') {
    return { text: sending.message, tone: 'danger' };
  }
  if (sending.kind === 'declined') {
    return {
      text: 'GitHub was not allowed to open the pull request under your name. Lingua can open it for you, with your commits.',
      tone: 'text',
    };
  }
  if (drafts > 0) {
    return { text: `${counted(drafts, 'change')} not sent yet`, tone: 'text' };
  }
  if (sending.kind === 'sent') {
    return { text: `Sent to pull request #${sending.number}`, tone: 'success' };
  }
  return { text: 'Edit a message, then send your changes from here', tone: 'textMuted' };
}

function Summary({
  sending,
  drafts,
  proposed,
  proposal,
}: Readonly<{
  sending: Sending;
  drafts: number;
  proposed?: number;
  proposal: ProposalView | null;
}>) {
  const status = statusOf(sending, drafts);
  return (
    <Column gap={2} grow={1} shrink={1} basis={200} minW={0}>
      <Text variant="label" color={status.tone}>
        {status.text}
      </Text>
      {proposal ? (
        <Text variant="meta" color="textDim">
          {proposed
            ? `${counted(proposed, 'change')} in the pull request, waiting for a maintainer`
            : 'Sent changes are in the pull request, waiting for a maintainer'}
        </Text>
      ) : null}
    </Column>
  );
}

function PullRequestLink({ proposal }: Readonly<{ proposal: ProposalView }>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="git-pull-request"
      label={`Pull request #${proposal.number}`}
      href={proposal.url}
      role="link"
    />
  );
}

function SendThroughLingua({
  disabled,
  onSend,
}: Readonly<{ disabled: boolean; onSend: (via: SendVia) => void }>) {
  return (
    <Button
      variant="outline"
      size="sm"
      label="Send through Lingua instead"
      disabled={disabled}
      onPress={() => onSend('lingua')}
    />
  );
}

function Actions({
  sending,
  drafts,
  proposal,
  onSend,
}: Readonly<{
  sending: Sending;
  drafts: number;
  proposal: ProposalView | null;
  onSend: (via: SendVia) => void;
}>) {
  return (
    <Row gap={8} wrap>
      {proposal ? <PullRequestLink proposal={proposal} /> : null}
      {sending.kind === 'declined' ? (
        <SendThroughLingua disabled={drafts === 0} onSend={onSend} />
      ) : null}
      <Button
        size="sm"
        icon="send"
        label={drafts > 0 ? `Send ${counted(drafts, 'change')}` : 'Send changes'}
        disabled={drafts === 0}
        loading={sending.kind === 'sending'}
        onPress={() => onSend('fork')}
      />
    </Row>
  );
}

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

/** The viewer's unsent edits for one language, the button that sends them as a pull request, and a link to it. */
export function SendBar({
  project,
  locale,
  drafts,
  proposed,
  proposal,
}: Readonly<{
  project: string;
  locale: string;
  drafts: number;
  proposed?: number;
  proposal: ProposalView | null;
}>) {
  const { sending, send } = useSending({ project, locale });
  return (
    <Dock>
      <Summary sending={sending} drafts={drafts} proposed={proposed} proposal={proposal} />
      <Actions
        sending={sending}
        drafts={drafts}
        proposal={proposal}
        onSend={(via) => void send(via)}
      />
    </Dock>
  );
}
