import { SiteFooterBar } from '@kromatv/site-kit/site-footer-bar';
import { site } from '@kromatv/site-meta';

const LINKS = [
  { label: 'Source code', href: site.repo },
  { label: 'Running Lingua', href: `${site.repo}/blob/main/apps/lingua/README.md` },
  { label: 'Privacy', href: site.links.privacy },
  { label: 'KROMA', href: site.url },
];

/** Lingua's footer: one line, as a tool's should be. */
export function LinguaFooter() {
  return <SiteFooterBar links={LINKS} />;
}
