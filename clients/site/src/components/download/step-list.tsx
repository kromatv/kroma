import { Rich } from '#site/components/rich';

export interface StepListProps {
  steps: readonly string[];
}

/** A tight numbered procedure, for the short "trust, then install" flows
 *  where the full walkthrough lives in INSTALL.md. */
export function StepList({ steps }: Readonly<StepListProps>) {
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: authored inline, never reordered
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
          <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-[0.7rem] font-bold text-accent">
            {i + 1}
          </span>
          <span>
            <Rich>{step}</Rich>
          </span>
        </li>
      ))}
    </ol>
  );
}
