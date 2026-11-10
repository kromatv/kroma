import { describe, expect, it } from 'vitest';
import { DOC_CHATS } from './doc-chats';

describe('DOC_CHATS', () => {
  it('starts a conversation with the prompt as one query value', () => {
    const prompt = 'Read https://kroma.tv/docs/docker.md & "help" me';

    const href = DOC_CHATS.claude.href(prompt);

    expect(href.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(new URL(href).searchParams.get('q')).toBe(prompt);
  });

  it('opens every assistant over https', () => {
    for (const { href } of Object.values(DOC_CHATS)) {
      expect(new URL(href('x')).protocol).toBe('https:');
    }
  });
});
