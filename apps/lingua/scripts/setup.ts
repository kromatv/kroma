import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const Conversion = z.object({
  id: z.number(),
  slug: z.string(),
  html_url: z.string(),
  owner: z.object({ login: z.string() }),
  client_id: z.string(),
  client_secret: z.string(),
  webhook_secret: z.string(),
  pem: z.string(),
});

const Held = z.array(z.object({ results: z.array(z.object({ code: z.string() })) }));

const CODE = /^[A-Za-z0-9_-]{8,64}$/;
const here = fileURLToPath(new URL('..', import.meta.url));

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'from-d1': { type: 'boolean' }, owner: { type: 'string' } },
});

async function wrangler(args: string[], stdin?: string): Promise<string> {
  const child = Bun.spawn(['bunx', 'wrangler', ...args], {
    cwd: here,
    stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const out = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) {
    throw new Error(`wrangler ${args[0]} ${args[1]} failed`);
  }
  return out;
}

async function heldCodes(): Promise<string[]> {
  const out = await wrangler([
    'd1',
    'execute',
    'kroma-lingua',
    '--remote',
    '--json',
    '--command',
    'SELECT code FROM setup_codes ORDER BY created_at DESC',
  ]);
  return Held.parse(JSON.parse(out)).flatMap((r) => r.results.map((row) => row.code));
}

async function convert(code: string) {
  const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kroma-lingua-setup' },
  });
  return response.ok ? Conversion.parse(await response.json()) : null;
}

const codes = values['from-d1'] ? await heldCodes() : positionals.filter((c) => CODE.test(c));
if (codes.length === 0) {
  console.error(
    values['from-d1']
      ? 'No App is waiting: open /setup on the deployment and create one first.'
      : 'usage: bun run --filter @kromatv/lingua setup <code> | --from-d1 [--owner <login>]',
  );
  process.exit(2);
}

const converted = (await Promise.all(codes.map(convert))).flatMap((c) => (c ? [c] : []));
const owned = (c: z.infer<typeof Conversion>) =>
  !values.owner || c.owner.login.toLowerCase() === values.owner.toLowerCase();
for (const stranger of converted.filter((c) => !owned(c))) {
  console.error(`Skipped ${stranger.html_url}: it belongs to ${stranger.owner.login}. Delete it.`);
}
const app = converted.find(owned) ?? null;
if (values['from-d1']) {
  await wrangler([
    'd1',
    'execute',
    'kroma-lingua',
    '--remote',
    '--command',
    'DELETE FROM setup_codes',
  ]);
}
if (!app) {
  console.error('GitHub took none of the codes. Each is valid for one hour and works once.');
  process.exit(1);
}

await wrangler(
  ['secret', 'bulk'],
  JSON.stringify({
    GITHUB_APP_ID: String(app.id),
    GITHUB_APP_SLUG: app.slug,
    GITHUB_APP_PRIVATE_KEY: app.pem,
    GITHUB_CLIENT_ID: app.client_id,
    GITHUB_CLIENT_SECRET: app.client_secret,
    GITHUB_WEBHOOK_SECRET: app.webhook_secret,
  }),
);

console.log(`Stored the secrets of ${app.html_url}`);
console.log(`Install it: https://github.com/apps/${app.slug}/installations/new`);
