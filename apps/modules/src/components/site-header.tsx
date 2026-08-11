import { SiteHeader as Header } from '@kroma/site-kit/site-header';
import { site } from '@kroma/site-meta';
import { Button } from '#ui/components/atoms/button';

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
