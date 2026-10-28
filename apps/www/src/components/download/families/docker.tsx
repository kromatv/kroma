import { IconBrandDocker } from '@tabler/icons-react';
import { useDownloadChannel, useDownloadRelease } from '#site/components/download/channel';
import { CodeBlock } from '#site/components/download/code-block';
import { IMAGE } from '#site/components/download/image-channels';
import { PlatformEntry } from '#site/components/download/platform-entry';
import { StepList } from '#site/components/download/step-list';
import { dockerCommand } from '#site/lib/docker-command';
import { m } from '#site/paraglide/messages';

/** A copyable terminal command for the chosen release channel. */
export function DockerPanel() {
  const channel = useDownloadChannel();
  const release = useDownloadRelease();
  const tag = channel === 'canary' ? 'latest' : release?.version;
  return (
    <PlatformEntry
      icon={IconBrandDocker}
      name="Docker"
      badge={m.download_docker_badge()}
      description={m.download_docker_body()}
      help={
        <StepList
          steps={[
            m.download_docker_step_1(),
            m.download_docker_step_2(),
            m.download_docker_step_3(),
          ]}
        />
      }
    >
      {tag ? (
        <CodeBlock code={dockerCommand(`${IMAGE}:${tag}`)} label={m.download_docker_terminal()} />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted">
          {m.download_docker_unavailable()}
        </p>
      )}
    </PlatformEntry>
  );
}
