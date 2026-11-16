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

/** The shape of the one-hour code GitHub returns from a manifest. */
export const SETUP_CODE = /^[A-Za-z0-9_-]{8,64}$/;
