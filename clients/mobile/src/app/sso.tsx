import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useClientCache } from '#mobile/components/signInHooks';
import { authFor } from '#mobile/lib/providerSignIn';
import { useSession } from '#mobile/lib/session';

/** Where a provider flow comes back when the system hands its return link to
 * the router. The sign-in screen that began the flow usually collects it
 * first; this route collects it when the link is all that arrives, and
 * otherwise only gets out of the way. */
export default function ProviderReturn() {
  const { flow, code } = useLocalSearchParams<{ flow?: string; code?: string }>();
  const { serverUrl, status, adopt } = useSession();
  const clientFor = useClientCache();
  const router = useRouter();
  const began = useRef(false);

  useEffect(() => {
    if (began.current) return;
    began.current = true;
    const leave = () => router.replace(status === 'signedIn' ? '/(app)/(tabs)' : '/sign-in');
    if (!serverUrl || !flow || !code) {
      leave();
      return;
    }
    authFor(serverUrl, clientFor(serverUrl))
      .resume({ flow, code })
      .then((end) => {
        if (end?.result.status !== 'signedIn') {
          leave();
          return;
        }
        adopt(serverUrl, end.result);
        router.replace('/(app)/(tabs)');
      }, leave);
  }, [adopt, clientFor, code, flow, router, serverUrl, status]);

  return null;
}
