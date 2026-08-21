import { site } from '@kroma/site-meta';
import { Button } from '#site/components/button';
import { Container } from '#site/components/container';
import { docs, ProseLink } from '#site/components/download/links';
import { Panel } from '#site/components/download/panel';
import { L } from '#site/components/localized-link';
import { m } from '#site/paraglide/messages';

/** Where to go next, and the one failure worth pre-empting. */
export function Closing() {
  return (
    <section className="border-t border-border/60 py-20">
      <Container>
        <Panel pad="lg">
          <p className="max-w-2xl text-pretty leading-relaxed text-muted">
            {m.download_closing_note()}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button href={docs.installGuide} size="lg">
              {m.download_closing_guide()}
            </Button>
            <ProseLink href={site.tvUrl}>{m.download_closing_tv_demo()}</ProseLink>
            <L
              to="/support"
              className="text-accent-text underline decoration-accent-text/40 underline-offset-2 hover:decoration-accent-text"
            >
              {m.download_closing_help()}
            </L>
          </div>
        </Panel>
      </Container>
    </section>
  );
}
