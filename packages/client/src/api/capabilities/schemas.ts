import { z } from 'zod';

// A member this build cannot read is dropped rather than taken as a reason to
// refuse the whole listing: a source ships on its own tag and may have learned a
// figure kind or an action this one has never heard of.
const dropping = <Schema extends z.ZodType>(member: Schema) =>
  z
    .array(z.unknown())
    .default([])
    .transform((listed): z.output<Schema>[] =>
      listed.flatMap((one) => {
        const read = member.safeParse(one);
        return read.success ? [read.data] : [];
      }),
    );

/** How one figure's value is read: `percent` is a fraction of one, `rate` is
 * bytes per second, `ratio` is two counts, `count` is one, and `text` is words
 * a client only prints. */
export const CapabilityFigureKind = z.enum(['percent', 'rate', 'ratio', 'count', 'text']);
export type CapabilityFigureKind = z.infer<typeof CapabilityFigureKind>;

/** `label` is the source's own words, already in the viewer's language, because
 * a sidecar has no core catalog to look a key up in. */
export const CapabilityFigure = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1).optional(),
    kind: CapabilityFigureKind,
  })
  .transform(({ label, ...figure }) => ({ ...figure, label: label ?? figure.key }));
export type CapabilityFigure = z.infer<typeof CapabilityFigure>;

/** Something a viewer may do to what is arriving, in the source's own words. */
export const CapabilityAction = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
});
export type CapabilityAction = z.infer<typeof CapabilityAction>;

const moduleNamed = (mount: string) => mount.split('/').filter(Boolean).pop() ?? mount;

/** `icon` is a name from the module icon vocabulary. */
export const CapabilitySource = z
  .object({
    mount: z.string().min(1),
    label: z.string().min(1).optional(),
    icon: z.string().min(1).nullish(),
    figures: dropping(CapabilityFigure),
    map: z.object({ label: z.string().min(1) }).nullish(),
    actions: dropping(CapabilityAction),
  })
  .transform(({ label, ...source }) => ({
    ...source,
    label: label ?? moduleNamed(source.mount),
  }));
export type CapabilitySource = z.infer<typeof CapabilitySource>;

/** Where one capability is answered, as a path from the server's origin.
 * `sources` is absent on a server that predates the declaration. */
export const Capability = z.object({
  mount: z.string().min(1),
  sources: z.array(CapabilitySource).optional(),
});
export type Capability = z.infer<typeof Capability>;

/** `GET /api/capabilities`. A capability nothing answers is absent from the map,
 * which is how a client reads "this server cannot do it". */
export const CapabilityView = z.object({
  capabilities: z.record(z.string(), Capability),
});
export type CapabilityView = z.infer<typeof CapabilityView>;

export type Capabilities = CapabilityView['capabilities'];
