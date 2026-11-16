import { SiteFooter, footerColumns } from '@kromatv/site-kit/site-footer';
import { site } from '@kromatv/site-meta';

const BLURB =
  'Translate a project in the browser: sign in with GitHub, fix or add a language, and your edits reach the repository as a pull request.';

const COLUMNS = footerColumns({
  sibling: { label: 'Modules', href: site.modulesUrl },
  guide: { label: 'Running Lingua', href: `${site.repo}/blob/main/apps/lingua/README.md` },
});

/** The site-wide footer. `origin` is the address this deployment answers on. */
export function LinguaFooter({ origin }: Readonly<{ origin: string }>) {
  return (
    <SiteFooter blurb={BLURB} columns={COLUMNS} url={{ label: 'Lingua URL', value: origin }} />
  );
}
