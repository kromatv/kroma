import type { ConfirmOptions } from '@kromatv/ui/kit/organisms/dialog';
import { counted } from '#site/lib/counted';
import type { ProposalView } from '#site/lib/views';

/** The unsent work a discard throws away: where, in which language, how much, and the pull request that holds what was sent. */
export interface DiscardTarget {
  project: string;
  locale: string;
  language: string;
  drafts: number;
  started: boolean;
  proposal: ProposalView | null;
}

/** Whether discarding takes the language with it: one the viewer started and never sent. */
export function removesLanguage({ started, proposal }: DiscardTarget): boolean {
  return started && proposal === null;
}

/** The question a discard asks before it throws anything away. */
export function discardQuestion(target: DiscardTarget): ConfirmOptions {
  const { language, drafts, proposal } = target;
  if (removesLanguage(target)) {
    return {
      title: `Discard ${language}?`,
      message: `You started ${language} and never sent it. It goes, with every change you made in it. This cannot be undone.`,
      confirmLabel: `Discard ${language}`,
      cancelLabel: 'Cancel',
      destructive: true,
    };
  }
  const kept = proposal ? ` Pull request #${proposal.number} keeps what you already sent.` : '';
  return {
    title: `Discard ${counted(drafts, 'change')} in ${language}?`,
    message: `Your unsent edits and confirmations are thrown away, and each message reads as the branch has it.${kept} This cannot be undone.`,
    confirmLabel: 'Discard',
    cancelLabel: 'Cancel',
    destructive: true,
  };
}

/** What the toast says once a discard went through. */
export function discardedMessage(
  target: DiscardTarget,
  result: Readonly<{ discarded: number; removed: boolean }>,
): string {
  return result.removed
    ? `${target.language} discarded`
    : `Discarded ${counted(result.discarded, 'change')}`;
}
