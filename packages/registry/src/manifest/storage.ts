import { z } from 'zod';

// A table (`downloads`) or one of its columns (`users.username`). Anything not
// listed is denied, so the spelling has to be exact.
const TableOrColumn = z.string().regex(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?$/);

/** The slice of the SHARED core database a module may reach. */
export const CoreScope = z.object({
  read: z
    .array(TableOrColumn)
    .nullish()
    .describe(
      'Tables and columns this module may SELECT, as "table" or "table.column". A column named in a WHERE is reached as much as one that is projected.',
    ),
  write: z
    .array(TableOrColumn)
    .nullish()
    .describe(
      'Tables this module may INSERT / UPDATE / DELETE. A write grant is not a read grant, and a foreign key drags its other table in: writing a child reads the parent, and a cascading delete writes the child.',
    ),
});
export type CoreScope = z.infer<typeof CoreScope>;

/** A module's databases, and the capability itself. */
export const Storage = z.object({
  core: CoreScope.nullish().describe(
    "The slice of the shared core database this module may reach. Enforced per connection by SQLite's authorizer at prepare time, so it cannot be worked around by building the SQL as a string. Absent means none of it.",
  ),
  adopt: z
    .array(z.string().regex(/^[A-Za-z_]\w*$/))
    .nullish()
    .describe(
      "Tables this module used to keep in the core database and now owns. The core moves each one - schema, indexes and rows - into the module's own file before the module is spawned, then drops the core copy, so it happens exactly once.",
    ),
});
export type Storage = z.infer<typeof Storage>;
