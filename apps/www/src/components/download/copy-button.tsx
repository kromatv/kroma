import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useState } from 'react';
import { m } from '#site/paraglide/messages';

export interface CopyButtonProps {
  value: string;
}

/**
 * Server-safe by construction: the clipboard API is touched only inside the click
 * handler, which never runs during SSR/prerender. Before hydration the button is
 * inert markup.
 */
export function CopyButton({ value }: Readonly<CopyButtonProps>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Some embedded/TV webviews expose no clipboard: no-op rather than throw.
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? m.download_ui_copied() : m.download_ui_copy_aria()}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-xs font-medium text-dim transition-colors hover:bg-wash hover:text-text focus-visible:text-text focus-visible:outline-none"
    >
      {copied ? (
        <IconCheck size={14} stroke={2} className="text-accent" aria-hidden />
      ) : (
        <IconCopy size={14} stroke={1.75} aria-hidden />
      )}
      {copied ? m.download_ui_copied() : m.download_ui_copy()}
    </button>
  );
}
