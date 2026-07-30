import { CopyButton } from '#site/components/download/copy-button';

export interface CodeBlockProps {
  code: string;
  label?: string;
}

/** Comment lines (`# …`) are dimmed at render time only; `code` is untouched. */
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
