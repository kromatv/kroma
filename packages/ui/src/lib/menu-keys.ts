/// <reference path="types/react-native-tv.d.ts" />
import { TVEventControl } from 'react-native';

/** An app host owns the native Menu switch; nested consumers take leases. */
export function createMenuKeys() {
  let holders = 0;
  return {
    hold() {
      holders += 1;
      if (holders === 1) TVEventControl?.enableTVMenuKey?.();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders -= 1;
        if (holders === 0) TVEventControl?.disableTVMenuKey?.();
      };
    },
  };
}
