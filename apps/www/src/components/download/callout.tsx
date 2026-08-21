import type { ReactNode } from 'react';
import type { IconComponent } from '#site/components/download/icon';

export interface CalloutProps {
  icon: IconComponent;
  tag: string;
  children: ReactNode;
}

export function Callout({ icon: Icon, tag, children }: Readonly<CalloutProps>) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
      <Icon size={16} stroke={1.75} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
      <p className="text-sm leading-relaxed text-muted">
        <span className="mr-1.5 font-sans text-[0.68rem] font-bold uppercase tracking-wider text-accent-text">
          {tag}
        </span>
        {children}
      </p>
    </div>
  );
}
