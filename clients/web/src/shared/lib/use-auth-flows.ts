import { type Auth, createAuth, type FlowBrowser } from '@kromatv/core';
import { useMemo } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { tabFlowStore } from '#web/shared/lib/sso-flow';
import { getPasskey } from '#web/shared/lib/webauthn';

const pageBrowser: FlowBrowser = {
  open: (url) => {
    window.location.assign(url);
    return new Promise((resolve) => {
      const restored = (event: PageTransitionEvent) => {
        if (!event.persisted) return;
        window.removeEventListener('pageshow', restored);
        resolve(null);
      };
      window.addEventListener('pageshow', restored);
    });
  },
};

/** Every way to sign in, for a web page: a flow through a provider takes this
 * tab there, and the page it comes back to resumes it. */
export function useAuthFlows(): Auth {
  const { client } = useAuth();
  return useMemo(
    () => createAuth({ client, browser: pageBrowser, store: tabFlowStore, passkey: getPasskey }),
    [client],
  );
}
