import { describe, expect, it } from 'vitest';
import { readWireGuard } from './wireguard-file';

const PROTON = `[Interface]
# Key for Multiple tunnel 2
# NetShield = 1
# NAT-PMP (Port Forwarding) = on
PrivateKey = k
Address = 10.2.0.2/32
DNS = 10.2.0.1

[Peer]
# CH#3
PublicKey = p
AllowedIPs = 0.0.0.0/0
Endpoint = 62.169.136.4:51820`;

describe('readWireGuard', () => {
  it('names the Proton server a file was made for, and whether it forwards a port', () => {
    expect(readWireGuard(PROTON)).toEqual({
      valid: true,
      proton: { server: 'CH#3', portForwarding: true },
    });
  });

  it('reads a file from another provider as a config with no Proton label', () => {
    const plain = '[Interface]\nPrivateKey = k\n[Peer]\nPublicKey = p\nEndpoint = 1.2.3.4:51820';

    expect(readWireGuard(plain)).toEqual({ valid: true, proton: null });
  });

  it('refuses text that is missing a section or a key', () => {
    expect(readWireGuard('[Interface]\nPrivateKey = k').valid).toBe(false);
    expect(readWireGuard('hello').valid).toBe(false);
  });

  it('reads a file saved with Windows line endings', () => {
    expect(readWireGuard(PROTON.replaceAll('\n', '\r\n')).proton?.server).toBe('CH#3');
  });
});
