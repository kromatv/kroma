import { useEffect, useRef } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';

/** Opens What's new over home once per launch, when the signed-in reader has a
 * release they have not been shown. The once lives in the caller, so it must be
 * a component that lasts as long as the app. */
export function useWhatsNewOnLaunch(): void {
  const { route, go } = useNav();
  const { user, ready } = useAuth();
  const { client } = useConnection();
  const asked = useRef(false);
  const signedIn = ready && user !== null;
  const onHome = route.name === 'home';

  useEffect(() => {
    if (asked.current || !signedIn || !client || !onHome) return;
    asked.current = true;
    let cancelled = false;
    client.releases
      .list()
      .then((view) => {
        if (!cancelled && view.unseen) go('whatsNew');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, client, onHome, go]);
}
