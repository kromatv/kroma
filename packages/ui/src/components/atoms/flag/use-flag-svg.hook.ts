import { useEffect, useState } from 'react';
import { fetchFlagSvg, flagSvgNow } from '#ui/lib/flag-svg';

interface Fetched {
  readonly region: string;
  readonly svg: string | undefined;
}

/** The square flag of `region` as an SVG document: at once where it is at
 *  hand, once fetched where it is not, and nothing where there is none. */
export function useFlagSvg(region: string): string | undefined {
  const now = flagSvgNow(region);
  const [fetched, setFetched] = useState<Fetched>();
  useEffect(() => {
    if (now !== undefined) {
      return undefined;
    }
    let live = true;
    void fetchFlagSvg(region).then((svg) => {
      if (live) {
        setFetched({ region, svg });
      }
    });
    return () => {
      live = false;
    };
  }, [region, now]);
  return now ?? (fetched?.region === region ? fetched.svg : undefined);
}
