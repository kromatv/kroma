const chat = (name: string, base: string) => ({
  name,
  href: (prompt: string) => `${base}?q=${encodeURIComponent(prompt)}`,
});

/** The assistants a guide opens in. Each `href` is the address that starts a
 *  conversation with the prompt already written. */
export const DOC_CHATS = {
  claude: chat('Claude', 'https://claude.ai/new'),
  chatgpt: chat('ChatGPT', 'https://chatgpt.com/'),
} as const;

export type DocChatId = keyof typeof DOC_CHATS;
