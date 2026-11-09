// @vitest-environment jsdom

import type { NetworkView } from '@kromatv/client/network';
import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuleActionBadge, RuleActionField } from '#web/features/admin/network-rule-action';

function Providers({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <KitProvider config={{ entry: { physicalKeyboard: true } }}>
      {onScreen(<>{children}</>)}
    </KitProvider>
  );
}

const { render } = createInputTestHost();

const carried = { carries: { tcp: true, udp: false, dns: true }, up: true };
const DEFAULT: NetworkView = { ...carried, name: 'vpn', label: 'Proton VPN · CH#3' };
const NL12: NetworkView = { ...carried, name: 'vpn-40fd4c79cd7a7537', label: 'Proton VPN · NL#12' };

afterEach(cleanup);

describe('where a rule sends what it matches', () => {
  it('offers direct, the VPN and block while there is one network', () => {
    render(<RuleActionField value="direct" networks={[DEFAULT]} onChange={vi.fn()} />, {
      wrapper: Providers,
    });

    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Direct',
      'VPN',
      'Block',
    ]);
  });

  it('names the default VPN by the server it follows once there are several', () => {
    render(<RuleActionField value="vpn" networks={[DEFAULT, NL12]} onChange={vi.fn()} />, {
      wrapper: Providers,
    });

    expect(screen.getByText('Default VPN · Proton VPN · CH#3')).toBeTruthy();
  });

  it('names a pinned server by the name its module gives it', () => {
    render(
      <RuleActionField
        value="vpn-40fd4c79cd7a7537"
        networks={[DEFAULT, NL12]}
        onChange={vi.fn()}
      />,
      { wrapper: Providers },
    );

    expect(screen.getByText('Proton VPN · NL#12')).toBeTruthy();
  });
});

describe('a rule row', () => {
  it('shows the server a rule pins', () => {
    render(<RuleActionBadge action="vpn-40fd4c79cd7a7537" networks={[DEFAULT, NL12]} />, {
      wrapper: Providers,
    });

    expect(screen.getByText('Proton VPN · NL#12')).toBeTruthy();
  });

  it('shows the bare name of a server no longer on offer', () => {
    render(<RuleActionBadge action="vpn-40fd4c79cd7a7537" networks={[DEFAULT]} />, {
      wrapper: Providers,
    });

    expect(screen.getByText('vpn-40fd4c79cd7a7537')).toBeTruthy();
  });
});
