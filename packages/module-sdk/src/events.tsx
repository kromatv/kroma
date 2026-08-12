// Live server events for module pages: one socket per mount, torn down with
// the component, handler always the latest render's.

import { KromaEvents, type ServerEvent } from '@kroma/core';
import { useEffect, useRef } from 'react';
import { useAdminHost } from './admin/context';

/** Subscribe to the server's event socket. A module widens the frame union
 *  with its own event types, declared in its package, not in core:
 *
 *  ```ts
 *  useServerEvents<DownloadProgressEvent | VpnStatusEvent>((e) => { ... });
 *  ```
 */
export function useServerEvents<M extends { type: string } = never>(
  onEvent: (e: ServerEvent | M) => void,
): void {
  const { apiBase } = useAdminHost();
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  useEffect(() => {
    const ev = new KromaEvents<ServerEvent | M>(apiBase, {
      onEvent: (e) => handler.current(e),
    });
    ev.connect();
    return () => ev.close();
  }, [apiBase]);
}
