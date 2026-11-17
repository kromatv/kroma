import type { SendBarActions, Work } from '#site/lib/send-status';
import { useDiscard } from '#site/lib/use-discard.hook';
import { useLanguageCommands } from '#site/lib/use-language-commands.hook';
import { useSending } from '#site/lib/use-sending.hook';
import type { LocaleView, NamespaceView } from '#site/lib/views';

/**
 * The viewer's work in the language of a page: what the send bar says, and
 * the send and the discard it offers, lent to the command menu as well.
 */
export function useLanguageWork(view: LocaleView | NamespaceView) {
  const { language, started } = view.locale;
  const target = { project: view.project.id, locale: language.tag };
  const sending = useSending(target);
  const discarding = useDiscard({
    ...target,
    language: language.name,
    drafts: view.drafts,
    started,
    proposal: view.proposal,
  });
  useLanguageCommands(view, { send: sending.send, discard: discarding.discard });
  const work: Work = {
    sending: sending.sending,
    drafts: view.drafts,
    proposed: view.proposed,
    proposal: view.proposal,
  };
  const act: SendBarActions = {
    onSend: () => void sending.send(),
    onDiscard: () => void discarding.discard(),
    discarding: discarding.busy,
  };
  return { work, act };
}
