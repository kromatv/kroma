-- Schema 4: a server says which CI build it runs, as the build number its
-- canary file is named after, and 0 when it was built from source. NULL is a
-- row written by an older shape, which cannot say.
ALTER TABLE instances ADD COLUMN build INTEGER;
