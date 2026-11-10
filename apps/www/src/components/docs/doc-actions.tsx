import { site } from '@kromatv/site-meta';
import {
  IconBrandOpenai,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconMarkdown,
  IconMessage,
  IconSparkles,
} from '@tabler/icons-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { DOC_CHATS, type DocChatId } from '#site/lib/doc-chats';
import { localizePath, useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

export interface DocActionsProps {
  title: string;
  markdown: string;
  className?: string;
}

type Copied = 'page' | 'prompt' | undefined;

const CHAT_GLYPH: Record<DocChatId, typeof IconSparkles> = {
  claude: IconSparkles,
  chatgpt: IconBrandOpenai,
};

const ITEM =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-wash hover:text-text focus-visible:bg-wash focus-visible:text-text focus-visible:outline-none [&>svg]:shrink-0';

async function pageBlob(markdown: string): Promise<Blob> {
  const response = await fetch(markdown);
  if (!response.ok) throw new Error(`${markdown} answered ${response.status}`);
  return new Blob([await response.text()], { type: 'text/plain' });
}

function Glyph({ done, children }: Readonly<{ done: boolean; children: ReactNode }>) {
  return done ? <IconCheck size={16} className="text-accent-text" aria-hidden /> : children;
}

/** What a reader hands to an AI assistant: the guide as Markdown, a prompt that
 *  points at it, or a conversation opened on that prompt. */
export function DocActions({ title, markdown, className }: Readonly<DocActionsProps>) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<Copied>();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const prompt = m.docs_ai_prompt({
    url: `${site.url}${markdown}`,
    title,
    index: `${site.url}${localizePath('/llms.txt', lang)}`,
  });

  const flash = (what: Copied) => {
    setCopied(what);
    window.setTimeout(() => setCopied(undefined), 1600);
  };

  const copyPage = () => {
    const item = new ClipboardItem({ 'text/plain': pageBlob(markdown) });
    void navigator.clipboard.write([item]).then(() => flash('page'));
  };

  const copyPrompt = () => {
    void navigator.clipboard.writeText(prompt).then(() => flash('prompt'));
  };

  return (
    <div
      ref={root}
      className={['relative inline-flex rounded-lg border border-border text-sm', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={copyPage}
        className="inline-flex cursor-pointer items-center gap-2 rounded-l-lg px-3 py-2 font-medium text-muted transition-colors hover:bg-wash hover:text-text focus-visible:text-text"
      >
        <Glyph done={copied === 'page'}>
          <IconCopy size={16} aria-hidden />
        </Glyph>
        {copied === 'page' ? m.docs_ai_copied() : m.docs_ai_copy_page()}
      </button>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        aria-label={m.docs_ai_more()}
        onClick={() => setOpen((was) => !was)}
        className="inline-flex cursor-pointer items-center rounded-r-lg border-l border-border px-2 text-muted transition-colors hover:bg-wash hover:text-text focus-visible:text-text"
      >
        <IconChevronDown
          size={16}
          aria-hidden
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={panel}
          className="absolute left-0 top-full z-20 mt-2 w-72 sm:left-auto sm:right-0 max-w-[calc(100vw-2rem)] rounded-2xl border border-border-strong bg-surface-1 p-2 shadow-pop"
        >
          <button type="button" onClick={copyPrompt} className={ITEM}>
            <Glyph done={copied === 'prompt'}>
              <IconMessage size={16} aria-hidden />
            </Glyph>
            {copied === 'prompt' ? m.docs_ai_copied() : m.docs_ai_copy_prompt()}
          </button>
          <a href={markdown} target="_blank" rel="noopener" className={ITEM}>
            <IconMarkdown size={16} aria-hidden />
            {m.docs_ai_view_markdown()}
          </a>
          {(Object.keys(DOC_CHATS) as DocChatId[]).map((id) => {
            const Icon = CHAT_GLYPH[id];
            return (
              <a
                key={id}
                href={DOC_CHATS[id].href(prompt)}
                target="_blank"
                rel="noreferrer noopener"
                className={ITEM}
              >
                <Icon size={16} aria-hidden />
                {m.docs_ai_open_in({ name: DOC_CHATS[id].name })}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
