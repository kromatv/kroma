import { withKitStyles, withTheme } from '@kroma/ui/ssr';
import handler from '@tanstack/react-start/server-entry';
import { type ExecCtx, machineResponse } from '#site/lib/api';
import type { Env } from '#site/lib/source';

const page = withTheme(withKitStyles((request) => handler.fetch(request)));

export default {
  async fetch(request: Request, env: Env, ctx: ExecCtx): Promise<Response> {
    const machine = await machineResponse(request, env, ctx);
    return machine ?? page(request);
  },
};
