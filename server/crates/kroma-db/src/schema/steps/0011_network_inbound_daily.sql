-- `day` counts days since the Unix epoch, in UTC.
CREATE TABLE network_inbound_daily (
    day        INTEGER NOT NULL,
    address    TEXT NOT NULL,
    via        TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    count      INTEGER NOT NULL,
    bytes_in   INTEGER NOT NULL,
    bytes_out  INTEGER NOT NULL,
    last_at    INTEGER NOT NULL,
    PRIMARY KEY (day, address, via, user_agent)
) WITHOUT ROWID;
