import type { LogLine } from '../run';
import { locate, type Tool } from './detect';

/** Installs a missing tool and returns its path. Idempotent: an installed tool returns early. */
export async function installTool(tool: Tool, log: LogLine): Promise<string> {
  const already = locate(tool);
  if (already) return already;

  if (!tool.install) throw new Error(`${tool.label} is missing: install it from ${tool.source}`);
  log(`installing ${tool.label} from ${tool.source}`);
  await tool.install(log);

  const path = locate(tool);
  if (!path) throw new Error(`${tool.label} installed but ${tool.binary} is not on PATH`);
  log(`${tool.label} ready: ${path}`);
  return path;
}

export async function download(url: string, dest: string, log: LogLine): Promise<void> {
  // No redirect: these URLs serve the file directly, and refusing a hop is what
  // stops the download being pointed somewhere else.
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`GET ${url} answered ${response.status}`);

  const total = Number(response.headers.get('content-length') ?? '0');
  const sink = Bun.file(dest).writer();
  let written = 0;
  let reported = 0;
  for await (const chunk of response.body) {
    sink.write(chunk);
    written += chunk.byteLength;
    const percent = total ? Math.floor((written / total) * 100) : 0;
    if (percent >= reported + 10) {
      reported = percent;
      log(`  ${percent}% of ${(total / 1e6).toFixed(0)} MB`);
    }
  }
  await sink.end();
}
