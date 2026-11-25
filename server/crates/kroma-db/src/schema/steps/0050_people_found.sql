-- Who TMDB says each person written by hand or read from a `.nfo` file is,
-- when the provider gave no one of that name for the title (LIB-99): their
-- TMDB id and their portrait, cached under `profile_url` from
-- `profile_source`. A name TMDB has nobody for is kept with no id, and asked
-- again once `searched_at` is old enough.
CREATE TABLE people_found (
    name           TEXT PRIMARY KEY NOT NULL,
    tmdb_id        INTEGER,
    profile_url    TEXT,
    profile_source TEXT,
    searched_at    INTEGER NOT NULL
);
CREATE INDEX people_found_profile ON people_found (profile_url);
