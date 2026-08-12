// Where a discovered file sits in the repository. A bundler hands the workbench
// whatever path it globbed from - Vite a path relative to the host, Metro one
// relative to the directory its context was opened on - and both have to name
// the same file to git and to a link.

/** A discovered path as the repository spells it: one that already contains
 * `root` is cut there, one relative to it is joined onto it. */
function repoPath(root: string, path: string): string {
  const at = path.indexOf(`${root}/`);
  if (at >= 0) return path.slice(at);
  return `${root}/${path.replace(/^(?:\.\.?\/)+/, '')}`;
}

/** The folder a file sits in, or the path itself when it has none. */
function folderOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut > 0 ? path.slice(0, cut) : path;
}

export { folderOf, repoPath };
