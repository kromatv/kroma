// @vitest-environment jsdom
import { addCatalogs } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModuleScope, useT } from './scope';

const MODULE_ID = 'tv.kroma.probe';

const disposers: (() => void)[] = [];

function install(catalogs: Record<string, Record<string, string>>, scope = MODULE_ID) {
  disposers.push(addCatalogs(scope, catalogs));
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

function Message({ messageKey }: Readonly<{ messageKey: string }>) {
  const t = useT();
  return <span>{t(messageKey)}</span>;
}

function mount(children: ReactNode, id: string | null = MODULE_ID) {
  render(
    <I18nProvider locale="fr">
      {id === null ? children : <ModuleScope id={id}>{children}</ModuleScope>}
    </I18nProvider>,
  );
}

describe('useT inside a module', () => {
  it('reads a key the module shipped and the app has never heard of', () => {
    install({ fr: { 'probe.own': 'Depuis le module' } });

    mount(<Message messageKey="probe.own" />);

    expect(screen.getByText('Depuis le module')).toBeTruthy();
  });

  it('falls back to the app for a key the module does not carry', () => {
    install({ fr: { 'probe.own': 'Depuis le module' } });

    mount(<Message messageKey="common.cancel" />);

    expect(screen.queryByText('common.cancel')).toBeNull();
  });

  it('lets a module override an app key for itself alone', () => {
    install({ fr: { 'common.cancel': 'Laisser tomber' } });

    mount(<Message messageKey="common.cancel" />);

    expect(screen.getByText('Laisser tomber')).toBeTruthy();
  });

  it('leaves the app untouched outside a module page', () => {
    install({ fr: { 'common.cancel': 'Laisser tomber' } });

    mount(<Message messageKey="common.cancel" />, null);

    expect(screen.queryByText('Laisser tomber')).toBeNull();
  });

  it('does not leak one module catalog into another', () => {
    install({ fr: { 'probe.own': 'Depuis le module' } });

    mount(<Message messageKey="probe.own" />, 'tv.kroma.other');

    expect(screen.getByText('probe.own')).toBeTruthy();
  });
});
