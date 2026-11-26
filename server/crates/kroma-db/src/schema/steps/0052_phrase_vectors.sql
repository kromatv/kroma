-- The embedder's vector of each phrase the home ranks titles against (a
-- theme's mood, the query of a row a model named), kept between starts so the
-- first home after one does not ask the embedder again. Keyed by the module
-- that answered, and read only at the width it answers now, like item_vectors.
CREATE TABLE phrase_vectors (
    module  TEXT NOT NULL,
    phrase  TEXT NOT NULL,
    dim     INTEGER NOT NULL,
    vec     BLOB NOT NULL,
    kept_at INTEGER NOT NULL,
    PRIMARY KEY (module, phrase)
);
CREATE INDEX phrase_vectors_kept ON phrase_vectors (kept_at);
