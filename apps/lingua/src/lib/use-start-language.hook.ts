import { toast } from '@kromatv/ui/kit/organisms/toast';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, startLanguage } from '#site/lib/api-client';
import { projectParams } from '#site/lib/project-id';

/** Where starting a language stands: idle, asking for one tag, or refused with the server's reason. */
export type Starting =
  | { kind: 'idle' }
  | { kind: 'starting'; tag: string }
  | { kind: 'failed'; message: string };

/** Starts a language in `project` for the viewer, then opens its page. */
export function useStartLanguage(project: string) {
  const router = useRouter();
  const [starting, setStarting] = useState<Starting>({ kind: 'idle' });

  const start = async (tag: string) => {
    setStarting({ kind: 'starting', tag });
    try {
      const started = await startLanguage({ project, locale: tag });
      toast({
        message: `${started.name} started`,
        detail: 'Only you see it until you send it',
        tone: 'success',
        icon: 'language',
      });
      await router.invalidate();
      await router.navigate({
        to: '/$owner/$repo/$locale',
        params: { ...projectParams(project), locale: started.locale },
      });
    } catch (error: unknown) {
      setStarting({
        kind: 'failed',
        message:
          error instanceof ApiError
            ? error.message
            : 'The language could not be started. Try again.',
      });
    }
  };

  return { starting, start };
}
