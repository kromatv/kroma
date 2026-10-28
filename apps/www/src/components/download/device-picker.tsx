import type { IconComponent } from '#site/components/download/icon';

export interface DeviceChoice {
  id: string;
  name: string;
  icon: IconComponent;
  logoOnly?: boolean;
}

/** Compact device choices above the same download panel used on desktop. */
export function DevicePicker({
  choices,
  selected,
  onSelect,
  label,
  controls,
}: Readonly<{
  choices: readonly DeviceChoice[];
  selected: string;
  onSelect: (id: string) => void;
  label: string;
  controls: string;
}>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          aria-pressed={selected === choice.id}
          aria-controls={controls}
          onClick={() => onSelect(choice.id)}
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${selected === choice.id ? 'border-accent/50 bg-accent-soft text-accent-text' : 'border-border bg-surface-2/25 text-muted hover:border-border-strong hover:text-text'}`}
        >
          <choice.icon size={20} aria-hidden />
          <span className={choice.logoOnly ? 'sr-only' : undefined}>{choice.name}</span>
        </button>
      ))}
    </div>
  );
}
