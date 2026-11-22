-- A NULL maturity is 18+, which hides nothing, and a NULL ratings country is
-- the server's metadata country: an upgrade changes nobody's home.
ALTER TABLE users ADD COLUMN maturity INTEGER;
ALTER TABLE users ADD COLUMN ratings_country TEXT;
