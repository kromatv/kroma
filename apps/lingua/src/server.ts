import { workerContext } from '@kromatv/site-kit/worker-env';
import { withKitStyles, withTheme } from '@kromatv/ui/ssr';
import handler from '@tanstack/react-start/server-entry';
import { api, type ExecCtx } from '#site/server/api';
import { type Env, readEnv } from '#site/server/env';
import { refreshAll } from '#site/server/scheduled';

const page = withTheme(withKitStyles((request) => handler.fetch(request)));

const later: ExecCtx = { waitUntil: (promise) => void promise.catch(() => {}) };

async function bindings(raw: Record<string, unknown> | undefined): Promise<Env> {
  return readEnv(raw ?? (await workerContext()).env);
}

export default {
  async fetch(request: Request, raw?: Record<string, unknown>, ctx?: ExecCtx): Promise<Response> {
    return (await api(request, await bindings(raw), ctx ?? later)) ?? page(request);
  },
  scheduled(_controller: unknown, raw: Record<string, unknown>, ctx: ExecCtx): void {
    ctx.waitUntil(bindings(raw).then((env) => refreshAll(env, Math.floor(Date.now() / 1000))));
  },
};
