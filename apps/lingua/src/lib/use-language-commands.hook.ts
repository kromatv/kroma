import { useRouter } from '@tanstack/react-router';
import { discardCommands, sendCommands, syncCommand } from '#site/lib/command-actions';
import { type Destination, sectionCommands } from '#site/lib/command-rows';
import { projectParams } from '#site/lib/project-id';
import { useCommands } from '#site/lib/use-command-menu.hook';
import { useSyncNow } from '#site/lib/use-sync-now.hook';
import type { LocaleView, NamespaceView } from '#site/lib/views';

function useSectionOpener(project: string, locale: string): (destination: Destination) => void {
  const router = useRouter();
  return (destination) => {
    if (destination.to === 'section') {
      void router.navigate({
        to: '/$owner/$repo/$locale/$',
        params: { ...projectParams(project), locale, _splat: destination.file },
      });
    }
  };
}

/** What the viewer can do with their changes in a language. */
export interface WorkActions {
  send: () => Promise<void>;
  discard: () => Promise<void>;
}

/**
 * Lends the command menu what a language's pages can do: send or discard the
 * viewer's changes, sync the repository, and on the language page itself open
 * each of its sections.
 */
export function useLanguageCommands(view: LocaleView | NamespaceView, act: WorkActions): void {
  const project = view.project.id;
  const { language } = view.locale;
  const syncing = useSyncNow(project);
  const open = useSectionOpener(project, language.tag);
  const files = 'namespaces' in view ? view.namespaces.map((namespace) => namespace.file) : [];
  const own = view.viewer
    ? [
        ...sendCommands(language.name, view.drafts, act.send),
        ...discardCommands(language.name, view.drafts, act.discard),
        syncCommand(project, syncing.run),
      ]
    : [];
  const at = { project, locale: language.tag, language: language.name };
  useCommands([...own, ...sectionCommands(at, files, open)]);
}
