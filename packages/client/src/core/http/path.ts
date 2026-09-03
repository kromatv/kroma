type Segments<P extends string> = P extends `${infer Head}/${infer Tail}`
  ? Head | Segments<Tail>
  : P;

type NameOf<S extends string> = S extends `:${infer Name}`
  ? Name extends `${infer Head}.${string}`
    ? Head
    : Name
  : never;

/** The parameter names a path template declares, as a union. */
export type PathParam<P extends string> = NameOf<Segments<P>>;

/** The `params` a path template demands: exactly its names, nothing else. */
export type PathParams<P extends string> = Record<PathParam<P>, string | number>;

const PARAM = /:(\w+)/g;

/** Fill a path template. Every value is `encodeURIComponent`-ed, so an id
 * carrying a slash or a space cannot reshape the URL. */
export function buildPath(template: string, params?: Readonly<Record<string, string | number>>) {
  return template.replace(PARAM, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`path ${template} has no value for :${name}`);
    return encodeURIComponent(String(value));
  });
}
