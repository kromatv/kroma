import type { RatingsCountry } from '@kromatv/client/accounts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '#web/shared/lib/auth';

export const RATINGS_HOUSEHOLD = 'household';

const RATINGS_COUNTRY = ['account', 'ratings-country'] as const;

/** Whose age ratings the account's badges show, and `choose`, which saves a country's
 *  code or {@link RATINGS_HOUSEHOLD}. `enabled: false` asks the server nothing. */
export function useRatingsCountry({ enabled = true }: Readonly<{ enabled?: boolean }> = {}): {
  ratings: RatingsCountry | undefined;
  choose: (value: string) => Promise<void>;
} {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: RATINGS_COUNTRY,
    queryFn: () => client.accounts.ratings.get(),
    enabled,
  });
  const choose = useCallback(
    async (value: string) => {
      const saved = await client.accounts.ratings.set(value === RATINGS_HOUSEHOLD ? null : value);
      queryClient.setQueryData(RATINGS_COUNTRY, saved);
    },
    [client, queryClient],
  );
  return { ratings: data, choose };
}
