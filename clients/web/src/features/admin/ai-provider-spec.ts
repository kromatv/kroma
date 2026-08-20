import type { MessageKey } from '@kroma/core';

// `apiKey` is a transient field ('' = keep the stored secret); `hasApiKey`
// reports whether one is stored server-side.
export type ProviderForm = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  temperature: number;
  maxTokens: number;
  reasoning: boolean;
};

export const PROVIDER_BASE: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: '',
  openai: '',
};
export const BASE_HINT_KEY: Record<string, MessageKey> = {
  anthropic: 'admin.aiBaseUrlAnthropic',
  openrouter: 'admin.aiBaseUrlOpenrouter',
};
export const MODEL_PLACEHOLDER: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openrouter: 'qwen/qwen-2.5-7b-instruct',
};

// Temperature is OpenAI-only, reasoning is Anthropic-only; unknown providers
// fall back to the openai layout.
export type Spec = {
  baseUrl: 'required' | 'advanced';
  apiKey: 'required' | 'optional';
  temperature: boolean;
  reasoning: boolean;
};
export const SPEC_OPENAI: Spec = {
  baseUrl: 'required',
  apiKey: 'optional',
  temperature: true,
  reasoning: false,
};
export const SPEC: Record<string, Spec> = {
  openai: SPEC_OPENAI,
  openrouter: { baseUrl: 'advanced', apiKey: 'required', temperature: true, reasoning: false },
  anthropic: { baseUrl: 'advanced', apiKey: 'required', temperature: false, reasoning: true },
};

export function hostOf(baseUrl: string, isAnthropic: boolean): string {
  if (!baseUrl) return isAnthropic ? 'api.anthropic.com' : '';
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export type Probe = { ok: boolean; text: string } | null;
export type Busy = 'idle' | 'test' | 'models';
