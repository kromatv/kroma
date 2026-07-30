import { CopyButton } from '#site/components/download/copy-button';

export interface CodeBlockProps {
  /**
   * The command(s), verbatim. This exact string is what the copy button places
   * on the clipboard, so it must stay paste-ready: no leading `$` prompts, real
   * newlines for multi-line snippets.
   */
  code: string;
  /** Caption in the header bar, a shell name (`bash`) or a filename. */
  label?: string;
}

/**
 * A command in the app's charcoal treatment: a raised surface, a hairline header
 * carrying the caption + copy affordance, and a horizontally scrollable body so
 * a long one-liner never widens the page. Comment lines (`# …`) are dimmed at
 * render time only, the copied `code` prop is untouched, which reads like a
 * lightly highlighted terminal without pulling in a syntax-highlighter.
 */
export function CodeBlock({ code, label = 'bash' }: Readonly<CodeBlockProps>) {
  const lines = code.split('\n');
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1 shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-surface-2/40 px-4 py-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-wider text-dim">{label}</span>
        <CopyButton value={code} />
      </div>
      <div className="overflow-x-auto">
        <pre className="px-4 py-3.5 text-[0.82rem] leading-relaxed">
          <code className="font-mono">
            {lines.map((line, i) => {
              const isComment = line.trimStart().startsWith('#');
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: static, order-stable code lines
                <span key={i} className={isComment ? 'text-dim' : 'text-text'}>
                  {line}
                  {i < lines.length - 1 ? '\n' : ''}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
