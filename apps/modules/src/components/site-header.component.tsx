import { SiteHeader as Header } from '@kromatv/site-kit/site-header';
import { site } from '@kromatv/site-meta';
import { Button } from '@kromatv/ui/kit/atoms/button';

/** The registry header: the shared site chrome, plus a link to the repository. */
export function SiteHeader({ title }: Readonly<{ title: string }>) {
  return (
    <Header
      title={title}
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon="brand-github"
          label="GitHub"
          href={site.repo}
          role="link"
        />
      }
    />
  );
}
