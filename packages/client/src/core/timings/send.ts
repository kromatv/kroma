import { APP_VERSION_HEADER } from '../http/app-version';
import type { SendResult, TimingSample } from './timing-sink';

interface ReportTarget {
  fetchFn: typeof globalThis.fetch;
  base: () => string;
  token: () => string | undefined;
  app?: string;
}

/** Posts `samples` to `/api/perf/client`. Nobody signed in, they are dropped;
 *  a server without the route answers `refused`. */
export async function sendTimings(
  target: ReportTarget,
  samples: TimingSample[],
): Promise<SendResult> {
  const bearer = target.token();
  if (!bearer) {
    return 'sent';
  }
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  };
  if (target.app) {
    headers[APP_VERSION_HEADER] = target.app;
  }
  const response = await target.fetchFn(`${target.base()}/api/perf/client`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ samples }),
  });
  return response.status === 404 || response.status === 405 ? 'refused' : 'sent';
}
