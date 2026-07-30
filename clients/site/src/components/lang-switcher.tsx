import { localeShort, locales, localizePath, useCanonicalPath, useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

// A compact EN | FR segmented control. Each side points at the SAME page in the
// other language: it keeps the reader's canonical path and only swaps the locale
// prefix, so switching language on /download lands on /fr/download rather than
// bouncing home.
//
// A plain <a>, not a router <Link>, and that is load-bearing twice over. The
// router localizes every href it generates to the ACTIVE locale (see the `output`
// rewrite in router.tsx), so a <Link> aiming at another language would be
// rewritten straight back to the current one - which is exactly what silently
// dropped /fr from the prerender. A real anchor is also a full document load,
// which is what a locale change should be: the whole page, including the shell
// that a soft navigation would leave mounted, re-renders in the new language.
export function LangSwitcher({ className }: Readonly<{ className?: string }>) {
  const active = useLang();
  const path = useCanonicalPath();

  return (
    // A <nav> rather than a div with role="group": this IS a set of navigation
    // links (each locale is a real URL), so the semantic element carries the
    // labelled grouping for a screen reader without an ARIA role to keep in step.
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
