// The Standard Schema v1 contract (https://standardschema.dev), vendored as
// types because it is a specification and not a runtime. Speaking it is what
// lets `useForm` take a zod, valibot or arktype schema while @kroma/ui depends
// on none of them.

type StandardPathSegment = PropertyKey | { readonly key: PropertyKey };

interface StandardIssue {
  readonly message: string;
  readonly path?: readonly StandardPathSegment[];
}

interface StandardResult<Output> {
  readonly value?: Output;
  readonly issues?: readonly StandardIssue[];
}

interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

/** The first path segment of an issue, which is the field it belongs to. A whole-object
 *  check (zod's `.refine()` on the object) has no path and belongs to the form itself. */
function issueField(issue: StandardIssue): string | undefined {
  const head = issue.path?.[0];
  if (head === undefined || head === null) return undefined;
  const key = typeof head === 'object' ? head.key : head;
  return typeof key === 'symbol' ? undefined : String(key);
}

export type { StandardIssue, StandardSchemaV1 };
export { issueField };
