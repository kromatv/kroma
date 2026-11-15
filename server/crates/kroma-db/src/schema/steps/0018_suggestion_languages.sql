-- The content locales a cached suggestion was generated for, as a JSON array.
-- A row written before this step has none: it was asked for the two languages
-- that existed then, which is how it is read.
ALTER TABLE item_suggestions ADD COLUMN asked_langs TEXT;
