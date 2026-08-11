import { site } from '@kroma/site-meta';
import { IconBrandDocker, IconBrandRust, IconInfoCircle, IconServer } from '@tabler/icons-react';
import { Callout } from '#site/components/download/callout';
import { CodeBlock } from '#site/components/download/code-block';
import type { IconComponent } from '#site/components/download/icon';
import { Panel } from '#site/components/download/panel';
import { StepList } from '#site/components/download/step-list';
import { Rich } from '#site/components/rich';
import { m } from '#site/paraglide/messages';

// Kept in step with the repo's docker-compose.yml.
const IMAGE = 'ghcr.io/maxscharwath/kroma:latest';

// Trimmed but runnable: the same image, port, volume layout and
// KROMA_MEDIA_DIRS, without the optional HTTPS block. The full version ships
// in the repo.
const COMPOSE = `services:
  kroma:
    image: ${IMAGE}
    restart: unless-stopped
    ports:
      - "4040:4040"
    environment:
      # Library roots INSIDE the container (must match the bind-mount below).
      KROMA_MEDIA_DIRS: /media
    volumes:
      - kroma-data:/data
      - /volume1/video:/media
volumes:
  kroma-data:`;

const CARGO = `# Rust ≥ 1.86 + ffprobe. From the repo:
cd server
KROMA_MEDIA_DIRS=/mnt/media cargo run --release`;

function OptionHead({
  icon: Icon,
  title,
  tag,
}: Readonly<{
  icon: IconComponent;
  title: string;
  tag?: string;
}>) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
        <Icon size={20} stroke={1.75} aria-hidden />
      </div>
      <h3 className="font-display text-lg font-bold text-text">{title}</h3>
      {tag && (
        <span className="ml-auto rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-accent">
          {tag}
        </span>
      )}
    </div>
  );
}

/** Step 1's body: the three ways to stand the server up. Docker leads, full
 *  width; Synology and cargo sit beneath as a pair. */
export function ServerOptions() {
  return (
    <div className="space-y-5">
      <Panel>
        <OptionHead
          icon={IconBrandDocker}
          title="Docker / Docker Compose"
          tag={m.download_server_docker_tag()}
        />
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          <Rich>{m.download_server_docker_body()}</Rich>
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <CodeBlock label="docker-compose.yml" code={COMPOSE} />
          <div className="flex flex-col gap-4">
            <CodeBlock label="bash" code="docker compose up -d" />
            <Callout icon={IconInfoCircle} tag={m.download_server_docker_media_tag()}>
              <Rich>{m.download_server_docker_media_body()}</Rich>
            </Callout>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <OptionHead icon={IconServer} title={m.download_server_synology_title()} />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            {m.download_server_synology_body()}
          </p>
          <div className="mt-5">
            <StepList
              steps={[
                m.download_server_synology_step_1(),
                m.download_server_synology_step_2(),
                m.download_server_synology_step_3(),
              ]}
            />
          </div>
        </Panel>

        <Panel>
          <OptionHead icon={IconBrandRust} title={m.download_server_cargo_title()} />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            {m.download_server_cargo_body()}
          </p>
          <div className="mt-5">
            <CodeBlock label="bash" code={CARGO} />
          </div>
          <a
            href={`${site.repo}/blob/main/server/README.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-opacity hover:opacity-80"
          >
            {m.download_server_cargo_link()}
          </a>
        </Panel>
      </div>
    </div>
  );
}
