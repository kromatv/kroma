/** The parts of Lingua the header leads to. */
export type Section = 'projects' | 'contributions' | 'status';

const OWN: Record<string, Section> = {
  '/contributions': 'contributions',
  '/setup': 'status',
};

/** The section the page at `pathname` belongs to: a project and everything under it are `projects`; a problem page is in none. */
export function sectionOf(pathname: string): Section | null {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (path === '/problem') {
    return null;
  }
  return OWN[path] ?? 'projects';
}
