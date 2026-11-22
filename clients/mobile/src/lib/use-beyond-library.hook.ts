import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '#mobile/lib/session';

/** What the provider holds beyond the library for `q`, asked once it has two
 *  letters, and never for a Kids session, which never sees a title the server
 *  does not hold (ACCT-138). */
export function useBeyondLibrary(q: string) {
  const client = useClient();
  const { user } = useSession();
  return useQuery({
    ...client.query.discovery.search(q),
    enabled: q.length >= 2 && user?.kids !== true,
    placeholderData: (prev) => prev,
  });
}
