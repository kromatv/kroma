import { site } from '@kroma/site-meta';
import { IconBrandGithub } from '@tabler/icons-react';
import { L } from '#site/components/localized-link';
import { WheelMark } from '#site/components/wheel-mark';
import { localizePath, useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

interface FLink {
  label: string;
  to?: string;
  href?: string;
}

function FooterLink({ label, to, href }: Readonly<FLink>) {
  const cls = 'text-sm text-muted transition-colors hover:text-text';
  if (to) {
    return (
      <L to={to} className={cls}>
        {label}
      </L>
    );
  }
  const external = href?.startsWith('http');
  return (
    <a
      href={href}
      className={cls}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {label}
    </a>
  );
}

export function SiteFooter() {
  const lang = useLang();
  const home = localizePath('/', lang);

  const columns: { title: string; links: FLink[] }[] = [
    {
      title: m.footer_col_product(),
      links: [
        { label: m.footer_link_features(), href: `${home}#fonctionnalites` },
        { label: m.footer_link_platforms(), href: `${home}#plateformes` },
        { label: m.footer_link_install(), to: '/download' },
        { label: m.footer_link_tv_demo(), href: site.tvUrl },
        { label: m.footer_link_ui_kit(), href: site.uiUrl },
        { label: m.footer_link_modules(), href: site.modulesUrl },
        { label: m.footer_link_packages(), href: site.packagesUrl },
      ],
    },
    {
      title: m.footer_col_resources(),
      links: [
        { label: m.footer_link_blog(), to: '/blog' },
        { label: m.footer_link_source(), href: site.repo },
        { label: m.footer_link_install_guide(), href: site.links.installGuide },
        { label: m.footer_link_contribute(), href: site.links.contributing },
      ],
    },
    {
      title: m.footer_col_contact(),
      links: [
        { label: site.email.support, href: `mailto:${site.email.support}` },
        { label: site.email.privacy, href: `mailto:${site.email.privacy}` },
      ],
    },
    {
      title: m.footer_col_legal(),
      links: [
        { label: m.footer_link_privacy(), to: '/privacy' },
        { label: m.footer_link_support(), to: '/support' },
        { label: m.footer_link_license(), href: site.links.license },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/70 bg-surface-1/40">
      <div className="mx-auto max-w-[75rem] py-16" style={{ paddingInline: 'var(--gutter-web)' }}>
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <WheelMark size={26} />
              <span className="font-display text-lg font-extrabold tracking-tight">KROMA</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">{m.footer_blurb()}</p>
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <IconBrandGithub size={18} stroke={1.75} aria-hidden />
              {m.footer_star()}
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-dim">
                {col.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink {...link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-8 text-sm text-dim sm:flex-row">
          <p>{m.footer_rights()}</p>
          <p>{m.footer_tagline()}</p>
        </div>
      </div>
    </footer>
  );
}
