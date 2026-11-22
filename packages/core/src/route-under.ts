/** Whether `pathname` is one of `roots` or a page below one: `/discover/movie/1`
 *  is under `/discover`, `/discoveries` is not. */
export function routeUnder(pathname: string, roots: readonly string[]): boolean {
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
