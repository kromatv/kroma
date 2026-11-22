import type { RatingsCountry } from '@kromatv/client/accounts';
import { useEffect, useRef, useState } from 'react';
import { kidsCountry } from '../auth/kids';

/** The ratings country a Kids form shows, the countries it may be, and the
 *  pick that changes it. */
export interface KidsCountry {
  country: string | null;
  countries: readonly string[];
  pick: (country: string) => void;
}

/** The ratings country a Kids form shows: the creating admin's own once
 *  `load` answers, or the one the admin picks. `null` until then, which the
 *  server reads as the admin's own (ACCT-155). `load` is called once. */
export function useKidsCountry(load: () => Promise<RatingsCountry>): KidsCountry {
  const [ratings, setRatings] = useState<RatingsCountry | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    let live = true;
    void loader.current().then(
      (read) => {
        if (live) {
          setRatings(read);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return {
    country: picked ?? (ratings ? kidsCountry(ratings) : null),
    countries: ratings?.countries ?? [],
    pick: setPicked,
  };
}
