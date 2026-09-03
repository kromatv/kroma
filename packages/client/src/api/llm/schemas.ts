import { z } from 'zod';
import { LlmProviderId } from './ids';

/** One configured provider as shown to the admin (the API key never returns). */
export const LlmProviderView = z.object({
  id: LlmProviderId,
  name: z.string(),
  provider: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  hasApiKey: z.boolean(),
  temperature: z.number(),
  maxTokens: z.number(),
  reasoning: z.boolean(),
});
export type LlmProviderView = z.infer<typeof LlmProviderView>;

/** `GET /api/admin/llm` the multi-provider LLM configuration. */
export const LlmAdminConfig = z.object({
  enabled: z.boolean(),
  defaultId: z.string(),
  providers: z.array(LlmProviderView),
});
export type LlmAdminConfig = z.infer<typeof LlmAdminConfig>;

/** One provider as saved. A blank or omitted `apiKey` keeps the stored secret,
 * and a BLANK `id` asks the server to mint one: a provider the admin has just
 * added has no id until it is saved. */
export const LlmProviderInput = LlmProviderView.omit({ hasApiKey: true, id: true }).extend({
  id: z.union([LlmProviderId, z.literal('')]),
  apiKey: z.string().optional(),
});
export type LlmProviderInput = z.infer<typeof LlmProviderInput>;

/** `PUT /api/admin/llm` body. The default is identified by index, not id: a
 * not-yet-saved provider has no id until the server assigns one. */
export const LlmSave = z.object({
  enabled: z.boolean(),
  defaultIndex: z.number(),
  providers: z.array(LlmProviderInput),
});
export type LlmSave = z.infer<typeof LlmSave>;

/** What a connection probe needs. Blank fields fall back to the saved provider
 * identified by `id`, notably a masked API key. */
export const LlmProbe = LlmProviderInput.pick({
  id: true,
  provider: true,
  baseUrl: true,
  model: true,
  apiKey: true,
}).exactPartial();
export type LlmProbe = z.infer<typeof LlmProbe>;
