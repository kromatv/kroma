-- `day` counts days since the Unix epoch, in UTC.
CREATE TABLE network_flows_daily (
    day       INTEGER NOT NULL,
    caller    TEXT NOT NULL,
    purpose   TEXT NOT NULL,
    host      TEXT NOT NULL,
    route     TEXT NOT NULL,
    verdict   TEXT NOT NULL,
    count     INTEGER NOT NULL,
    bytes_in  INTEGER NOT NULL,
    bytes_out INTEGER NOT NULL,
    last_at   INTEGER NOT NULL,
    PRIMARY KEY (day, caller, purpose, host, route, verdict)
) WITHOUT ROWID;
