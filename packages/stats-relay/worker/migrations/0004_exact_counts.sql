-- Schema 3: a server says how many accounts and titles it has, rather than
-- which band it falls in. The band columns go with the bands.
--
-- Nothing is carried across. `users_bucket = '2-5'` is a range, and writing a
-- number into the new column would invent one; a row written by a server still
-- on schema 2 keeps its version, its platform and its devices, and has no size
-- until that server updates.
ALTER TABLE instances ADD COLUMN users INTEGER;
ALTER TABLE instances ADD COLUMN titles INTEGER;

ALTER TABLE instances DROP COLUMN users_bucket;
ALTER TABLE instances DROP COLUMN titles_bucket;
