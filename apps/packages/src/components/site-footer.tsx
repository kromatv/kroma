import { SiteFooter as Footer, footerColumns } from '@kroma/site-kit/site-footer';
import { site } from '@kroma/site-meta';

const BLURB =
  'The Synology package source for KROMA: every release, stable and nightly, served straight to DSM Package Center.';

const COLUMNS = footerColumns({
  sibling: { label: 'Modules', href: site.modulesUrl },
  guide: { label: 'Releases', href: site.links.releases },
});

/** The site-wide footer. `source` is the package source URL this deployment serves. */
export function SiteFooter({ source }: Readonly<{ source: string }>) {
  return (
    <Footer blurb={BLURB} columns={COLUMNS} url={{ label: 'Package source', value: source }} />
  );
}
