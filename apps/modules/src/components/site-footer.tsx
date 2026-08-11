import { SiteFooter as Footer, footerColumns } from '@kroma/site-kit/site-footer';
import { site } from '@kroma/site-meta';

const BLURB =
  'The official module registry for KROMA: downloads, indexers, VPN and transcription, installed from your own server admin.';

const COLUMNS = footerColumns({
  sibling: { label: 'Synology packages', href: site.packagesUrl },
  guide: { label: 'Writing a module', href: `${site.repo}/blob/main/modules/README.md` },
});

/** The site-wide footer. `registry` is the catalog URL this deployment serves. */
export function SiteFooter({ registry }: Readonly<{ registry: string }>) {
  return (
    <Footer blurb={BLURB} columns={COLUMNS} url={{ label: 'Registry URL', value: registry }} />
  );
}
