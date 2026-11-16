import { styles, useStyles } from '@kromatv/ui/kit';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { useRouter } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { ApiError, sendProposal } from '#site/lib/api-client';
import { counted } from '#site/lib/counted';
import type { ProposalView } from '#site/lib/views';

type Sending =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; number: number }
  | { kind: 'failed'; message: string };

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
  if (drafts > 0) {
    return { text: `${counted(drafts, 'change')} not sent yet`, tone: 'text' };
  }
  if (sending.kind === 'sent') {
    return { text: `Sent to pull request #${sending.number}`, tone: 'success' };
  }
  return { text: 'Edit a message, then send your changes from here', tone: 'textMuted' };
}

function useSending(target: Readonly<{ project: string; locale: string }>) {
  const router = useRouter();
  const [sending, setSending] = useState<Sending>({ kind: 'idle' });

  const send = async () => {
    setSending({ kind: 'sending' });
    try {
      const result = await sendProposal(target);
      setSending(
        result.kind === 'proposed' ? { kind: 'sent', number: result.number } : { kind: 'idle' },
      );
      await router.invalidate();
    } catch (error: unknown) {
      setSending({
        kind: 'failed',
        message: error instanceof ApiError ? error.message : 'Sending failed. Try again.',
      });
    }
  };

  return { sending, send };
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

function Actions({
  sending,
  drafts,
  proposal,
  onSend,
}: Readonly<{
  sending: Sending;
  drafts: number;
  proposal: ProposalView | null;
  onSend: () => void;
}>) {
  return (
    <Row gap={8} wrap>
      {proposal ? <PullRequestLink proposal={proposal} /> : null}
      <Button
        size="sm"
        icon="send"
        label={drafts > 0 ? `Send ${counted(drafts, 'change')}` : 'Send changes'}
        disabled={drafts === 0}
        loading={sending.kind === 'sending'}
        onPress={onSend}
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
      <Actions sending={sending} drafts={drafts} proposal={proposal} onSend={() => void send()} />
    </Dock>
  );
}
