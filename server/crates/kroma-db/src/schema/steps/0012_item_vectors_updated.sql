-- The home and the hero poll MAX(updated_at) on every request to know whether
-- an embedding moved; without this it is a scan of every vector blob.
CREATE INDEX idx_item_vectors_updated ON item_vectors(updated_at);
