import type { InviteToken } from '@kromatv/client/accounts';
import type { ProviderId } from '@kromatv/client/sso';
import { useCallback } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { type FlowPurpose, rememberFlow } from '#web/shared/lib/sso-flow';

export interface ProviderFlowOptions {
  /** The path to come back to once the flow is collected. */
  returnTo: string;
  /** The invitation the person arrived on, for a sign-in. */
  invite?: InviteToken;
}

/** Begins a flow at a provider and sends this tab there. The promise settles
 * only when the flow could not begin: on success the page is already leaving. */
export function useProviderFlow() {
  const { client } = useAuth();
  return useCallback(
    async (purpose: FlowPurpose, provider: ProviderId, options: ProviderFlowOptions) => {
      const begin = {
        signIn: () => client.sso.start(provider, options.invite),
        link: () => client.sso.link(provider),
        test: () => client.sso.test(provider),
      }[purpose];
      const started = await begin();
      rememberFlow({
        flowId: started.flowId,
        secret: started.secret,
        purpose,
        provider,
        returnTo: options.returnTo,
      });
      window.location.assign(started.authorizeUrl);
    },
    [client],
  );
}
