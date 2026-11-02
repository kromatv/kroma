// Strict objects: a misspelt permission is refused, not ignored. Mirrors
// `Permissions` in `kroma-module-manifest`.

import { z } from 'zod';

const Purpose = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/)
  .describe(
    'Why the connection is made, e.g. "peers" or "metadata". The journal and the rules name it. It covers a call made for itself or a dotted child of it: "metadata" covers "metadata.discover", never "metadatax".',
  );

const SettingRef = /^setting:[A-Za-z0-9._]+$/;
const HostPattern = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const MAX_HOST_CHARS = 253;

const isHost = (to: string) =>
  HostPattern.test(to) && to.replace(/^\*\./, '').length <= MAX_HOST_CHARS;

const Destination = z
  .string()
  .refine((to) => to === 'public' || to === 'lan' || SettingRef.test(to) || isHost(to), {
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
        discovery: z
          .array(z.enum(['mdns', 'ssdp']))
          .nullish()
          .describe(
            'What this module may ask of the local network through the host, without a socket: publishing over mDNS, searching over SSDP.',
          ),
        host: z
          .boolean()
          .optional()
          .describe(
            "The programs this module starts use this machine's network directly: a network provider's own tunnel, a download engine's peers. Shown in red at install.",
          ),
      })
      .strict()
      .optional(),
    fs: z
      .object({ read: z.array(FsRoot).optional(), write: z.array(FsRoot).optional() })
      .strict()
      .optional(),
    run: z
      .array(z.string().regex(/^(?!\.{1,2}$)[^/]+$/))
      .optional()
      .describe(
        'Programs this module may start, by bare name: a helper it pins, or one on the server PATH. Only a module the official registry shipped may start any, and what it starts runs outside the component.',
      ),
    media: z
      .array(z.enum(['decode']))
      .optional()
      .describe(
        'The server\'s own media tools this module may have run on files it holds, under the server\'s ffmpeg budget: "decode" turns an audio track into raw PCM.',
      ),
    env: z
      .array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/))
      .optional()
      .describe(
        "Environment variables beyond the allowlist. The server's own variables are never passed.",
      ),
  })
  .strict();
export type Permissions = z.infer<typeof Permissions>;
