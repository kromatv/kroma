import { Button } from '#site/components/button';
import { Container } from '#site/components/container';
import { docs } from '#site/components/download/links';
import { Panel } from '#site/components/download/panel';
import { site } from '#site/lib/site';
import { m } from '#site/paraglide/messages';

/** The last word: why the one-time setup exists, and where to go next. */
export function Closing() {
  return (
    <section className="border-t border-border/60 py-20">
      <Container>
        <Panel pad="lg">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-extrabold text-text">
              {m.download_closing_title()}
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted">
              {m.download_closing_body()}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-dim">{m.download_closing_note()}</p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href={docs.releases} size="lg">
              {m.download_closing_releases()}
            </Button>
            <Button href={docs.installGuide} variant="outline" size="lg">
              {m.download_closing_guide()}
            </Button>
            <Button href={site.tvUrl} variant="outline" size="lg">
              {m.download_closing_tv_demo()}
            </Button>
            <Button to="/support" variant="ghost" size="lg">
              {m.download_closing_help()}
            </Button>
          </div>
        </Panel>
      </Container>
    </section>
  );
}
