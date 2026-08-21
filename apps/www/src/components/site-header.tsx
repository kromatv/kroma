import { site } from '@kroma/site-meta';
import { IconBrandGithub, IconMenu2 } from '@tabler/icons-react';
import { Button } from '#site/components/button';
import { LangSwitcher } from '#site/components/lang-switcher';
import { L } from '#site/components/localized-link';
import { Logo } from '#site/components/logo';
import { ThemeSwitcher } from '#site/components/theme-switcher';
import { localizePath, useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

function useNav() {
  const lang = useLang();
  const home = localizePath('/', lang);
  return [
    { kind: 'anchor', label: m.nav_features(), href: `${home}#fonctionnalites` },
    { kind: 'anchor', label: m.nav_platforms(), href: `${home}#plateformes` },
    { kind: 'route', label: m.nav_modules(), to: '/modules' },
    { kind: 'route', label: m.nav_install(), to: '/download' },
    { kind: 'route', label: m.nav_blog(), to: '/blog' },
  ] as const;
}

const linkCls =
  'text-sm font-medium text-muted transition-colors hover:text-text focus-visible:text-text';

export function SiteHeader() {
  const nav = useNav();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/80 backdrop-blur-xl backdrop-saturate-150">
      <div
        className="mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-6"
        style={{ paddingInline: 'var(--gutter-web)' }}
      >
        <Logo />

        <nav aria-label={m.header_home()} className="hidden items-center gap-8 md:flex">
          {nav.map((l) =>
            l.kind === 'route' ? (
              <L key={l.label} to={l.to} className={linkCls} activeClassName="text-text">
                {l.label}
              </L>
            ) : (
              <a key={l.label} href={l.href} className={linkCls}>
                {l.label}
              </a>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeSwitcher className="max-sm:hidden" />
          <LangSwitcher className="max-sm:hidden" />
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={m.header_github()}
            className="hidden size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-wash hover:text-text sm:flex"
          >
            <IconBrandGithub size={20} stroke={1.75} aria-hidden />
          </a>
          <div className="hidden sm:block">
            <Button to="/download" size="sm">
              {m.header_install()}
            </Button>
          </div>

          <details className="relative md:hidden">
            <summary
              className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-text transition-colors hover:bg-wash [&::-webkit-details-marker]:hidden"
              aria-label={m.header_menu()}
            >
              <IconMenu2 size={20} stroke={1.75} aria-hidden />
            </summary>
            <div className="absolute right-0 top-11 w-60 rounded-2xl border border-border-strong bg-surface-1 p-2 shadow-pop">
              <nav className="flex flex-col">
                {nav.map((l) =>
                  l.kind === 'route' ? (
                    <L
                      key={l.label}
                      to={l.to}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-wash hover:text-text"
                    >
                      {l.label}
                    </L>
                  ) : (
                    <a
                      key={l.label}
                      href={l.href}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-wash hover:text-text"
                    >
                      {l.label}
                    </a>
                  ),
                )}
                <a
                  href={site.repo}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-wash hover:text-text"
                >
                  <IconBrandGithub size={18} stroke={1.75} aria-hidden /> GitHub
                </a>
                <div className="mt-1 flex items-center gap-2 border-t border-border px-3 pt-3">
                  <LangSwitcher />
                  <ThemeSwitcher />
                </div>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
