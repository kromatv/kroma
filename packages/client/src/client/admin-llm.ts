// The LLM provider configuration behind the admin's AI settings.

import type { LlmAdminConfig } from '../types';
import { JSON_HEADERS, type RequestContext } from './base';

/** Blank fields fall back to the saved provider identified by `id`, notably a
 *  masked API key. */
export interface LlmProbe {
  id?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

/** API keys are never returned. */
export function adminLlm(ctx: RequestContext): Promise<LlmAdminConfig> {
  return ctx.json<LlmAdminConfig>('/admin/llm');
}

/** A blank/omitted `apiKey` keeps the stored secret. */
export interface LlmProviderInput {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  reasoning: boolean;
}

/** The default is identified by index, not id: a not-yet-saved provider has no
 *  id until the server assigns one. */
export interface LlmSave {
  enabled: boolean;
  defaultIndex: number;
  providers: LlmProviderInput[];
}

export function saveLlm(ctx: RequestContext, body: LlmSave): Promise<void> {
  return ctx.json<void>('/admin/llm', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function llmModels(
  ctx: RequestContext,
  probe: LlmProbe,
): Promise<{ models: string[]; error?: string }> {
  return ctx.json('/admin/llm/models', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(probe),
  });
}

/** Never rejects on a bad endpoint: failures come back as `{ ok: false }`. */
export function testLlm(
  ctx: RequestContext,
  probe: LlmProbe,
): Promise<{ ok: boolean; message: string }> {
  return ctx.json('/admin/llm/test', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(probe),
  });
}
