-- A Kids profile signs in by no means; its address is a reserved .invalid one
-- that no mail reaches and no sign-in matches.
ALTER TABLE users ADD COLUMN kids INTEGER NOT NULL DEFAULT 0;
