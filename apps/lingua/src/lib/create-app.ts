/**
 * Post `manifest` to GitHub's "new App" page, under `organisation` or the
 * signed-in account when null. GitHub's manifest flow takes a real form post,
 * so this builds one in the page and submits it.
 */
export function createApp(manifest: string, organisation: string | null): void {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = organisation
    ? `https://github.com/organizations/${encodeURIComponent(organisation)}/settings/apps/new`
    : 'https://github.com/settings/apps/new';
  const field = document.createElement('input');
  field.type = 'hidden';
  field.name = 'manifest';
  field.value = manifest;
  form.append(field);
  document.body.append(form);
  form.submit();
}
