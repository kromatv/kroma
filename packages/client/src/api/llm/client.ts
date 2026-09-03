import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import { LlmAdminConfig, type LlmProbe, type LlmSave } from './schemas';

const Models = z.object({ models: z.array(z.string()), error: z.string().optional() });
const Probe = z.object({ ok: z.boolean(), message: z.string() });

/** The LLM provider configuration behind the admin's AI settings. */
export default function llmApi(ctx: RequestContext) {
  return {
    /** API keys are never returned. */
    config: () => ctx.get('/admin/llm', LlmAdminConfig),

    save: (body: LlmSave) => ctx.put('/admin/llm', { body }),

    models: (probe: LlmProbe) => ctx.post('/admin/llm/models', Models, { body: probe }),

    /** Never rejects on a bad endpoint: failures come back as `{ ok: false }`. */
    test: (probe: LlmProbe) => ctx.post('/admin/llm/test', Probe, { body: probe }),
  };
}

declare module '../../core/client' {
  interface Domains {
    llm: ReturnType<typeof llmApi>;
  }
}
