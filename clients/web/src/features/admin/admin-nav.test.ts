import type { Permission } from '@kroma/core';
import type { ModuleNav } from '@kroma/module-sdk';
import { describe, expect, it } from 'vitest';
import { adminNavSections, NAV_GROUPS } from './admin-nav';

const modulePage = (to: string, section?: string): ModuleNav => ({
  moduleId: 'tv.kroma.torrents',
  to,
  label: to,
  ...(section === undefined ? {} : { section }),
});

const anyAdmin = () => true;
const readOnly = (cap: Permission | null) => cap === null;

const labels = (moduleNav: readonly ModuleNav[], allowed: (cap: Permission | null) => boolean) =>
  adminNavSections(moduleNav, allowed).sections.map((section) => section.labelKey);

describe('the console navigation', () => {
  it('names a section for every group that has something in it', () => {
    expect(labels([], anyAdmin)).toEqual([
      'admin.groupManagement',
      'admin.groupMedia',
      'admin.groupSystem',
      'admin.groupMaintenance',
    ]);
  });

  it('drops a page this viewer has no capability for', () => {
    const { sections } = adminNavSections([], readOnly);
    const management = sections.find((section) => section.labelKey === 'admin.groupManagement');
    expect(management?.items.map((item) => item.to)).toEqual(['/admin']);
  });

  it('drops a group left with nothing at all', () => {
    expect(labels([], readOnly)).toEqual(['admin.groupManagement', 'admin.groupMaintenance']);
  });

  it('renders a module page inside the group its section names', () => {
    const page = modulePage('/admin/downloads', 'acquisition');
    const { sections } = adminNavSections([page], anyAdmin);
    const acquisition = sections.find((section) => section.labelKey === 'admin.groupAcquisition');
    expect(acquisition?.modules).toEqual([page]);
    expect(acquisition?.items).toEqual([]);
  });

  it('keeps a section anchor out of the way until a module targets it', () => {
    expect(labels([], anyAdmin)).not.toContain('admin.groupAcquisition');
  });

  it('sets aside a module page whose section names no group', () => {
    const custom = modulePage('/admin/nowhere', 'somewhere-else');
    const known = modulePage('/admin/downloads', 'acquisition');
    const { orphans } = adminNavSections([custom, known], anyAdmin);
    expect(orphans).toEqual([custom]);
  });

  it('sets aside a module page that names no section at all', () => {
    const unplaced = modulePage('/admin/plain');
    const { sections, orphans } = adminNavSections([unplaced], anyAdmin);
    expect(orphans).toEqual([unplaced]);
    expect(sections.flatMap((section) => section.modules)).toEqual([]);
  });
});

describe('the console pages', () => {
  it('lead somewhere different from one another, under one section each', () => {
    const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));
    expect(new Set(paths).size).toBe(paths.length);
    const sections = NAV_GROUPS.map((group) => group.section);
    expect(new Set(sections).size).toBe(sections.length);
  });

  it('reads the dashboard as current only on its own path', () => {
    const dashboard = NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.to === '/admin',
    );
    expect(dashboard?.exact).toBe(true);
  });
});
