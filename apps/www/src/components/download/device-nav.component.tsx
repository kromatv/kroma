import type { IconComponent } from '#site/components/download/icon';

export interface DeviceNavProps {
  families: readonly { id: string; icon: IconComponent; title: string }[];
}

/** Jump straight to your own kind of screen. Plain anchors: every family is in
 *  the prerendered HTML, so this works before hydration and with no JS. */
export function DeviceNav({ families }: Readonly<DeviceNavProps>) {
  return (
    <nav className="flex flex-wrap gap-2">
      {families.map((family) => (
        <a
          key={family.id}
          href={`#${family.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1/50 py-1.5 pl-3.5 pr-4 transition-colors hover:border-accent hover:bg-accent-soft"
        >
          <family.icon size={16} stroke={1.75} className="text-accent-text" aria-hidden />
          <span className="font-sans text-sm font-medium text-text">{family.title}</span>
        </a>
      ))}
    </nav>
  );
}
