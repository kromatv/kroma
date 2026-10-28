import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { oidcFederationProvider } from '@anthropic-ai/sdk/lib/credentials/oidc-federation';
import { z } from 'zod';

/** One kind of request: the model, how hard it thinks, and how long it may take. */
export interface Call {
  model: 'claude-opus-5-5' | 'claude-haiku-5-5';
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs: number;
}

const API = 'https://api.anthropic.com';
const GithubToken = z.object({ value: z.string().min(1) });

async function githubIdentityToken(): Promise<string> {
  const env = process.env;
  const res = await fetch(`${env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${API}`, {
    headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`GitHub refused an identity token: ${res.status}`);
  return GithubToken.parse(await res.json()).value;
}

/**
 * A client on `ANTHROPIC_API_KEY`, or on the run's workload identity when the
 * `ANTHROPIC_*` federation variables are set; null when there is neither.
 */
export function client(): Anthropic | null {
  const env = process.env;
  if (env.ANTHROPIC_API_KEY) return new Anthropic({ maxRetries: 1 });
  const rule = env.ANTHROPIC_FEDERATION_RULE_ID;
  const organization = env.ANTHROPIC_ORGANIZATION_ID;
  if (!rule || !organization || !env.ACTIONS_ID_TOKEN_REQUEST_URL) return null;
  return new Anthropic({
    maxRetries: 1,
    credentials: oidcFederationProvider({
      identityTokenProvider: githubIdentityToken,
      federationRuleId: rule,
      organizationId: organization,
      serviceAccountId: env.ANTHROPIC_SERVICE_ACCOUNT_ID,
      workspaceId: env.ANTHROPIC_WORKSPACE_ID,
      baseURL: API,
      fetch,
    }),
  });
}

/**
 * The model's answer to `task`, parsed against `schema`. Null, with a warning,
 * when the model cannot be reached or stops before finishing; any other error
 * throws.
 */
export async function ask<T extends z.ZodType>(
  anthropic: Anthropic,
  call: Call,
  system: string,
  task: string,
  schema: T,
): Promise<z.infer<T> | null> {
  try {
    const stream = anthropic.beta.messages.stream(
      {
        model: call.model,
        max_tokens: call.maxTokens,
        ...(call.model === 'claude-opus-5-5'
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
        output_config: { effort: call.effort, format: betaZodOutputFormat(schema) },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: task }],
      },
      { timeout: call.timeoutMs },
    );
    const response = await stream.finalMessage().catch((error: unknown) => {
      const stop = stream.currentMessage?.stop_reason;
      if (stop && stop !== 'end_turn') {
        console.warn(`::warning::the model stopped on ${stop} before its answer was complete`);
      }
      throw error;
    });
    if (response.stop_reason !== 'end_turn') {
      console.warn(`::warning::the model stopped on ${response.stop_reason}; falling back`);
      return null;
    }
    return response.parsed_output ?? null;
  } catch (error) {
    if (!(error instanceof Anthropic.AnthropicError)) throw error;
    console.warn(`::warning::the model did not answer (${error.message}); falling back`);
    return null;
  }
}
