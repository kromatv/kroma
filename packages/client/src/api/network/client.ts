import type { RequestContext } from '../../core/client';
import {
  type FlowQuery,
  FlowsView,
  ListenersView,
  NetworkSummary,
  RulesView,
  type RulesUpdate,
} from './schemas';

/** The outbound firewall and its journal, for holders of `settings.manage`:
 * every connection the server and its modules open, the rules that route
 * them, and the sockets listening for the network. */
export default function networkApi(ctx: RequestContext) {
  return {
    flows: (query: FlowQuery = {}) => ctx.get('/admin/network/flows', FlowsView, { query }),

    /** Totals and per-destination groups over the last `days`. */
    summary: (days = 7) => ctx.get('/admin/network/summary', NetworkSummary, { query: { days } }),

    rules: () => ctx.get('/admin/network/rules', RulesView),

    /** Replaces the whole list. A refusal is a 400 whose `code` names what is
     * wrong with it. */
    saveRules: (update: RulesUpdate) => ctx.put('/admin/network/rules', { body: update }),

    listeners: () => ctx.get('/admin/network/listeners', ListenersView),
  };
}

declare module '../../core/client' {
  interface Domains {
    network: ReturnType<typeof networkApi>;
  }
}
