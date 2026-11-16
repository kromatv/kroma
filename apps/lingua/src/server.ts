import { workerContext } from '@kromatv/site-kit/worker-env';
import { withKitStyles, withTheme } from '@kromatv/ui/ssr';
import handler from '@tanstack/react-start/server-entry';
import { api } from '#site/server/api';
import { type Env, readEnv } from '#site/server/env';
import { refreshAll } from '#site/server/scheduled';

interface ExecCtx {
  waitUntil(promise: Promise<unknown>): void;
}

const page = withTheme(withKitStyles((request) => handler.fetch(request)));

async function bindings(raw: Record<string, unknown> | undefined): Promise<Env> {
  return readEnv(raw ?? (await workerContext()).env);
}

export default {
  async fetch(request: Request, raw?: Record<string, unknown>): Promise<Response> {
    return (await api(request, await bindings(raw))) ?? page(request);
  },
  scheduled(_controller: unknown, raw: Record<string, unknown>, ctx: ExecCtx): void {
    ctx.waitUntil(bindings(raw).then((env) => refreshAll(env, Math.floor(Date.now() / 1000))));
  },
};
