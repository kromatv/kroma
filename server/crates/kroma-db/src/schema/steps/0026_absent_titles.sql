-- A title whose files are all gone from a folder the scan read is marked absent
-- rather than deleted, so its record and the watch state keyed to it stay
-- (LIB-45). NULL is a title on disk.
ALTER TABLE items ADD COLUMN absent_since INTEGER;
