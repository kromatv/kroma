import { Release, type Release as PublishedRelease } from '../lib/release-feed';
import { classify } from '../lib/release-targets';
import { ROLLING_TAG } from '../lib/channels';
import { headers, repoOf, type Env } from './canary/github';

const MAX_BYTES = 8 * 1024 * 1024;

/** Read the two rolling releases directly; new uploads need no site deployment. */
export async function rollingReleases(env: Env): Promise<PublishedRelease[]> {
  return (
    await Promise.all(
      Object.values(ROLLING_TAG).map(async (tag): Promise<PublishedRelease | null> => {
        const res = await fetch(
          `https://api.github.com/repos/${repoOf(env)}/releases/tags/${tag}`,
          {
            headers: headers(env),
            signal: AbortSignal.timeout(8000),
          },
        );
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitHub release ${tag} answered ${res.status}`);
        const reader = res.body?.getReader();
        if (!reader) throw new Error('GitHub returned no release body');
        const decoder = new TextDecoder();
        let bytes = 0;
        let body = '';
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_BYTES) throw new Error('GitHub release exceeds size limit');
            body += decoder.decode(value, { stream: true });
          }
          body += decoder.decode();
          const release = Release.parse(JSON.parse(body));
          return {
            ...release,
            body: undefined,
            assets: release.assets.filter((asset) => classify(asset.name) !== null),
          };
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
      }),
    )
  ).filter((release): release is PublishedRelease => release !== null);
}
