const PATH_TAIL = 3;

/** A path short enough for one line: its last folders, after a mark that says
 * the start was cut. */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.length <= PATH_TAIL ? path : `…/${parts.slice(-PATH_TAIL).join('/')}`;
}
