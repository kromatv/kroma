import { localeShort, locales, localizePath, useCanonicalPath, useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

// A plain <a>, not a router <Link>: the router localizes every href it
// generates to the ACTIVE locale (see the `output` rewrite in router.tsx), so
// a <Link> aiming at another language would be rewritten straight back to the
// current one, which is what silently dropped /fr from the prerender.
export function LangSwitcher({ className }: Readonly<{ className?: string }>) {
  const active = useLang();
  const path = useCanonicalPath();

  return (
    // A <nav>, not a div with role="group": each locale is a real URL, so the
    // semantic element carries the labelled grouping without an ARIA role.
    <nav
      aria-label={m.lang_label()}
      className={[
        'inline-flex items-center rounded-lg border border-border p-0.5 text-xs font-semibold',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {locales.map((l) => {
        const isActive = l === active;
        return (
          <a
            key={l}
            href={localizePath(path, l)}
            hrefLang={l}
            aria-current={isActive ? 'true' : undefined}
            className={[
              'rounded-md px-2 py-1 transition-colors',
              isActive
                ? 'bg-accent text-accent-ink'
                : 'text-muted hover:text-text focus-visible:text-text',
            ].join(' ')}
          >
            {localeShort[l]}
          </a>
        );
      })}
    </nav>
  );
}
