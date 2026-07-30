import { Rich } from '#site/components/rich';

export interface StepListProps {
  /** Ordered steps, as catalog messages; each renders beside an amber ordinal,
   *  with its `mono` / *bright* markers resolved here. */
  steps: readonly string[];
}

/**
 * A tight numbered procedure. The ordinals are drawn as amber-ringed chips
 * rather than the browser's list markers, so a step reads like a checklist and
 * lines up under wrapping text. Used for the short "trust, then install" flows
 * where the full walkthrough lives in INSTALL.md.
 */
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
