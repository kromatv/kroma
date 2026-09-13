import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMatchRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { whatsNewSteps } from '#web/features/releases/release-model';
import { WhatsNewDialog } from '#web/features/releases/whats-new-dialog';
import { useAuth } from '#web/shared/lib/auth';
import { userQueries } from '#web/shared/lib/queries';

export function WhatsNewPrompt() {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery(userQueries.releases());
  const matchRoute = useMatchRoute();
  const onHistory = matchRoute({ to: '/whats-new' }) !== false;
  const onPlayer = matchRoute({ to: '/watch/$id' }) !== false;
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const unseen = data?.unseen;
    if (!data || !unseen || onPlayer || handled.current === unseen) return;
    const markSeen = () =>
      client.releases
        .markSeen(unseen)
        .then(() => queryClient.invalidateQueries({ queryKey: userQueries.releases().queryKey }))
        .catch(() => undefined);
    if (onHistory) {
      handled.current = unseen;
      void markSeen();
      return;
    }
    const whatsNew = whatsNewSteps(data);
    if (!whatsNew) return;
    handled.current = unseen;
    void WhatsNewDialog.call(whatsNew).then(markSeen);
  }, [data, onHistory, onPlayer, client, queryClient]);

  return <WhatsNewDialog />;
}
