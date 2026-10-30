// What a module may do, as its manifest declares it. Strict objects: a
// misspelt permission is refused rather than ignored, because an ignored one is
// either a module that silently gets nothing or a reviewer who reads a grant
// that is not there. Mirrors `Permissions` in `kroma-module-manifest`.

import { z } from 'zod';

const Purpose = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/)
  .describe(
    'Why the connection is made, e.g. "peers" or "metadata". The journal and the rules name it.',
  );

const SettingRef = /^setting:[A-Za-z0-9._]+$/;
const HostPattern = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const Destination = z
  .string()
  .refine((to) => to === 'public' || to === 'lan' || SettingRef.test(to) || HostPattern.test(to), {
    message: 'a destination is "public", "lan", a host, "*.domain" or "setting:<key>"',
  })
  .describe(
    '"public" for any internet host, "lan" for the local network, a host, "*.example.org" for a domain and its subdomains, or "setting:<key>" for the hosts an operator configured in that setting.',
  );

const Proto = z.enum(['tcp', 'udp']);

const Connect = z
  .object({
    purpose: Purpose,
    to: z.array(Destination).min(1),
    ports: z
      .array(z.number().int().min(1).max(65535))
      .optional()
      .describe('Allowed ports. Absent means any port.'),
    proto: z.array(Proto).optional().describe('Allowed protocols. Absent means TCP.'),
  })
  .strict();

const Listen = z
  .object({
    purpose: Purpose,
    proto: z.array(Proto).optional(),
    port: z
      .union([z.number().int().min(1).max(65535), z.string().regex(SettingRef)])
      .describe('A port, or "setting:<key>" naming the setting that holds it.'),
  })
  .strict();

const FsRoot = z
  .enum(['module', 'media', 'downloads', 'temp'])
  .describe(
    "A named place, never a raw path: the module's own data, the library (read-only), the download folder, scratch space.",
  );

/** The `permissions` block of a `module.json`. What it does not declare is denied. */
export const Permissions = z
  .object({
    net: z
      .object({
        connect: z
          .array(Connect)
          .optional()
          .describe('Outbound connections, one entry per purpose.'),
        listen: z
          .array(Listen)
          .optional()
          .describe(
            'Sockets the gateway listens on for this module. The module never binds a host interface itself.',
          ),
        host: z
          .boolean()
          .optional()
          .describe(
            "Run on the host's network, outside the sandbox: for LAN multicast and a network provider's own tunnel. Shown in red at install, official registry only by default.",
          ),
      })
      .strict()
      .optional(),
    fs: z
      .object({ read: z.array(FsRoot).optional(), write: z.array(FsRoot).optional() })
      .strict()
      .optional(),
    run: z
      .array(z.string().regex(/^[^/]+$/))
      .optional()
      .describe('Binaries this module may start, by bare name. They inherit its sandbox.'),
    env: z
      .array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/))
      .optional()
      .describe(
        "Environment variables beyond the allowlist. The server's own variables are never passed.",
      ),
  })
  .strict();
export type Permissions = z.infer<typeof Permissions>;
