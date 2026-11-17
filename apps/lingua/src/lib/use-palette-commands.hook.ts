import { useRouter } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import type { CommandRegistry, LinguaCommand } from '#site/lib/command-registry';
import { type Destination, indexCommands, messageCommands } from '#site/lib/command-rows';
import { projectParams } from '#site/lib/project-id';
import { useGlobalCommands } from '#site/lib/use-global-commands.hook';
import { useMessageHits, useMessageScope, useProjectIndex } from '#site/lib/use-palette-data.hook';
import { useSite } from '#site/lib/use-site.hook';

function useOpen(): (destination: Destination) => void {
  const router = useRouter();
  return (destination) => {
    const params = projectParams(destination.project);
    if (destination.to === 'project') {
      void router.navigate({ to: '/$owner/$repo', params });
    } else if (destination.to === 'language') {
      void router.navigate({
        to: '/$owner/$repo/$locale',
        params: { ...params, locale: destination.locale },
      });
    } else {
      void router.navigate({
        to: '/$owner/$repo/$locale/$',
        params: { ...params, locale: destination.locale, _splat: destination.file },
        hash: destination.key,
      });
    }
  };
}

/**
 * Every row the command menu lists for `query`: what the page lent it, the
 * messages of the page's language that match, every project and language,
 * and Lingua's own actions, each id once. `searching` says whether messages
 * are searched at all.
 */
export function usePaletteCommands(registry: CommandRegistry, query: string) {
  const lent = useSyncExternalStore(registry.subscribe, registry.rows, registry.rows);
  const scope = useMessageScope();
  const hits = useMessageHits(scope, query);
  const index = useProjectIndex();
  const open = useOpen();
  const global = useGlobalCommands(useSite()?.viewer ?? null);
  const rows: LinguaCommand[] = [
    ...lent,
    ...(scope ? messageCommands(scope, hits, open) : []),
    ...indexCommands(index, open),
    ...global,
  ];
  return { byId: new Map(rows.map((row) => [row.id, row])), searching: scope !== null };
}
