/** The GitHub App manifest a deployment at `origin` registers: what it may touch, and where GitHub calls it. */
export function appManifest(origin: string): Record<string, unknown> {
  const host = new URL(origin).host;
  return {
    name: `Lingua ${host}`.slice(0, 34),
    url: origin,
    description: 'Translate this repository in the browser; every contributor’s edits arrive as a pull request.',
    hook_attributes: { url: `${origin}/webhook`, active: true },
    redirect_url: `${origin}/setup/done`,
    public: true,
    request_oauth_on_install: false,
    default_permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
    default_events: ['push', 'pull_request'],
  };
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color-scheme:light dark}code,pre{font:14px ui-monospace,monospace}pre{padding:12px;border-radius:8px;background:color-mix(in srgb,currentColor 8%,transparent);overflow-x:auto}input,button{font:inherit;padding:8px 12px}</style>
</head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

function appSection(origin: string): string {
  const manifest = escapeHtml(JSON.stringify(appManifest(origin)));
  return `<h2>The GitHub App</h2>
<p>It keeps the repositories in sync and hears their webhooks. GitHub fills in every permission and address, and sends you back here.</p>
<form id="create" method="post" action="https://github.com/settings/apps/new">
<input type="hidden" name="manifest" value="${manifest}">
<p><label>Organisation (leave empty for your own account)<br><input id="org" placeholder="kromatv"></label></p>
<p><button type="submit">Create the GitHub App</button></p>
</form>
<script>document.getElementById('create').addEventListener('submit',function(){var o=document.getElementById('org').value.trim();if(o)this.action='https://github.com/organizations/'+encodeURIComponent(o)+'/settings/apps/new';});</script>`;
}

function oauthSection(origin: string): string {
  const name = escapeHtml(`Lingua ${new URL(origin).host}`.slice(0, 34));
  const at = escapeHtml(origin);
  return `<h2>The OAuth App</h2>
<p>Contributors sign in through it, and it opens each one's pull request from their own fork, under their name. Create it by hand under <a href="https://github.com/settings/applications/new">Settings → Developer settings → OAuth Apps</a> (an organisation's settings work too):</p>
<ul><li>Application name: <code>${name}</code></li>
<li>Homepage URL: <code>${at}</code></li>
<li>Authorization callback URL: <code>${at}/auth/callback</code></li></ul>
<p>Generate a client secret, then store both values as this Worker's secrets, from a checkout where wrangler is signed in:</p>
<pre>bunx wrangler secret put GITHUB_OAUTH_CLIENT_ID
bunx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET</pre>
<p>On KROMA's deployment, set them as <code>LINGUA_OAUTH_CLIENT_ID</code> and <code>LINGUA_OAUTH_CLIENT_SECRET</code> in the <code>sites</code> environment instead: the <code>Lingua</code> workflow stores them on its next run.</p>`;
}

/** `/setup`: what this deployment still lacks, the GitHub App (one button) and the OAuth App (made by hand). */
export function setupPage(origin: string, connected: { app: boolean; oauth: boolean }): Response {
  const sections = [connected.app ? '' : appSection(origin), connected.oauth ? '' : oauthSection(origin)];
  return page('Set up Lingua', `<p>Lingua talks to GitHub through two apps.</p>${sections.join('')}`);
}

/** The shape of the one-hour code GitHub returns from a manifest. */
export const SETUP_CODE = /^[A-Za-z0-9_-]{8,64}$/;

/** `/setup/done`: where GitHub returns with the one-hour code that trades for the App's secrets. */
export function setupDonePage(code: string | null, origin: string): Response {
  if (!code || !SETUP_CODE.test(code)) {
    return page(
      'Set up Lingua',
      '<p>GitHub did not send a code. Start again from <a href="/setup">/setup</a>.</p>',
    );
  }
  return page(
    'Almost there',
    `<p>GitHub created the App. Store its secrets in this Worker within the hour, one of two ways:</p>
<ul><li>From the deploy pipeline: run the <code>Lingua</code> workflow with <b>connect</b> ticked. This deployment kept the code for it.</li>
<li>From a checkout where wrangler is signed in: <pre>bun run --filter @kromatv/lingua setup ${escapeHtml(code)}</pre></li></ul>
<p>Then install the App on the repositories to translate. Each needs a <code>lingua.json</code> at its root.</p>
${oauthSection(origin)}`,
  );
}
