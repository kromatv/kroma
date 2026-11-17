import { counted } from '#site/lib/counted';
import type { Sending } from '#site/lib/use-sending.hook';
import type { ProposalView } from '#site/lib/views';

/** Where the viewer's work in a language stands, as the send bar says it. */
export interface SendStatus {
  title: string;
  tone: 'text' | 'textMuted' | 'danger' | 'success';
  detail: string;
}

/** What the viewer has in a language: the send under way, unsent and proposed changes, and their pull request. */
export interface Work {
  sending: Sending;
  drafts: number;
  proposed: number;
  proposal: ProposalView | null;
}

/** What the send bar does: send the viewer's changes, or throw them away. */
export interface SendBarActions {
  onSend: () => void;
  onDiscard: () => void;
  discarding: boolean;
}

const HOW = 'Sending opens a pull request from your fork, under your name.';

const DECLINED: SendStatus = {
  title: 'GitHub did not give the permission',
  tone: 'text',
  detail:
    'Lingua opens the pull request under your account, from your fork, so it needs public_repo. Try again and allow it.',
};

function afterSending({ proposed, proposal }: Work): string {
  if (!proposal) {
    return HOW;
  }
  const what = proposed > 0 ? `${counted(proposed, 'change')} waiting` : 'waiting';
  return `Pull request #${proposal.number} is open, ${what} for a maintainer.`;
}

function settled(work: Work, detail: string): SendStatus {
  if (work.sending.kind === 'sent') {
    return { title: `Sent to pull request #${work.sending.number}`, tone: 'success', detail };
  }
  if (work.proposal) {
    return { title: 'Everything is sent', tone: 'text', detail };
  }
  return {
    title: 'No changes yet',
    tone: 'textMuted',
    detail: 'Edit a message, then send it from here.',
  };
}

/** What the send bar says about `work`: a refusal first, then what is left to send, then how it went. */
export function sendStatus(work: Work): SendStatus {
  if (work.sending.kind === 'failed') {
    return { title: 'Not sent', tone: 'danger', detail: work.sending.message };
  }
  if (work.sending.kind === 'declined') {
    return DECLINED;
  }
  const detail = afterSending(work);
  if (work.drafts > 0) {
    return { title: `${counted(work.drafts, 'change')} not sent yet`, tone: 'text', detail };
  }
  return settled(work, detail);
}

/** What the send button says. */
export function sendLabel({ sending, drafts }: Pick<Work, 'sending' | 'drafts'>): string {
  if (sending.kind === 'declined') {
    return 'Try again';
  }
  return drafts > 0 ? `Send ${counted(drafts, 'change')}` : 'Send';
}

/** Whether the send bar has anything to say: changes, a pull request, or a send that went somewhere. */
export function worthShowing({ sending, drafts, proposal }: Work): boolean {
  return drafts > 0 || proposal !== null || sending.kind !== 'idle';
}
