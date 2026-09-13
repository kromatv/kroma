import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { kromaClient } from '#web/shared/lib/api';
import { userQueries } from '#web/shared/lib/queries';

export function useMarkReleaseSeen(unseen: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!unseen) return;
    void kromaClient()
      .releases.markSeen(unseen)
      .then(() => queryClient.invalidateQueries({ queryKey: userQueries.releases().queryKey }))
      .catch(() => undefined);
  }, [unseen, queryClient]);
}
