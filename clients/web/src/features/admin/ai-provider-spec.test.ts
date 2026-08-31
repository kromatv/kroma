import { describe, expect, it } from 'vitest';
import { BASE_HINT_KEY, hostOf, PROVIDER_BASE, SPEC, SPEC_OPENAI } from './ai-provider-spec';

describe('the host shown beside an AI provider', () => {
  it('names Anthropic reaching its own API with no base URL typed', () => {
    expect(hostOf('', true)).toBe('api.anthropic.com');
  });

  it('shows nothing for any other provider with no base URL typed', () => {
    expect(hostOf('', false)).toBe('');
  });

  it('keeps only the host of a URL, dropping scheme and path', () => {
    expect(hostOf('https://openrouter.ai/api/v1', false)).toBe('openrouter.ai');
  });

  it('keeps the port, since that is what a self-hosted runtime is reached on', () => {
    expect(hostOf('http://localhost:11434/v1', false)).toBe('localhost:11434');
  });

  it('echoes what was typed back when it does not parse as a URL', () => {
    expect(hostOf('not a url', true)).toBe('not a url');
  });
});

describe('what each provider asks the form for', () => {
  it('prefills only OpenRouter, whose endpoint is fixed', () => {
    expect(PROVIDER_BASE.openrouter).toBe('https://openrouter.ai/api/v1');
    expect(PROVIDER_BASE.openai).toBe('');
    expect(PROVIDER_BASE.anthropic).toBe('');
  });

  it('demands a base URL only where the operator picks the endpoint', () => {
    expect(SPEC.openai?.baseUrl).toBe('required');
    expect(SPEC.openrouter?.baseUrl).toBe('advanced');
    expect(SPEC.anthropic?.baseUrl).toBe('advanced');
  });

  it('offers temperature everywhere but Anthropic, and reasoning only there', () => {
    expect(SPEC.anthropic).toMatchObject({ temperature: false, reasoning: true });
    expect(SPEC.openai).toMatchObject({ temperature: true, reasoning: false });
    expect(SPEC.openrouter).toMatchObject({ temperature: true, reasoning: false });
  });

  it('lays an unknown provider out the way OpenAI is laid out', () => {
    expect(SPEC.ollama).toBeUndefined();
    expect(SPEC_OPENAI).toMatchObject({ baseUrl: 'required', apiKey: 'optional' });
  });

  it('hints at a base URL only where one is hidden behind the advanced fold', () => {
    expect(Object.keys(BASE_HINT_KEY).sort()).toEqual(['anthropic', 'openrouter']);
  });
});
