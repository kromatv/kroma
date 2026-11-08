-- The published history, counted again under the rule the page states.
--
-- Until now a row counted once its FIRST report was seven days old, so an
-- install that reported once and was never heard from again counted for three
-- weeks: every trial run, every container started without a volume, every dev
-- checkout. `counted` now asks for a week between the first report and the
-- latest one, and every day already written is recounted the same way.
--
-- Each day is taken at the nightly sweep's minute, 03:07 UTC. A row's latest
-- report as of that minute is not stored, so it is read as the earlier of its
-- last report and that minute: a server is assumed to have kept reporting
-- between its first report and its last, which a daily heartbeat does. Devices,
-- accounts and titles are not stored per day either, so a past day carries what
-- each server it counts reported last. Rows a server erased with /v1/forget are
-- gone and stay out.
--
-- The same thresholds as `aggregate.ts`: SETTLE_DAYS 7 (604800 s), ACTIVE_DAYS
-- 30 (2592000 s), SIZE_REPORTERS 2.

ALTER TABLE daily ADD COLUMN users INTEGER;
ALTER TABLE daily ADD COLUMN titles INTEGER;

UPDATE daily
   SET instances = recount.instances,
       clients = recount.clients,
       users = recount.users,
       titles = recount.titles
  FROM (
    SELECT d.day,
           COUNT(i.id) AS instances,
           COALESCE(SUM(COALESCE(i.clients_tv, 0) + COALESCE(i.clients_mobile, 0)
                        + COALESCE(i.clients_desktop, 0)), 0) AS clients,
           CASE WHEN COUNT(i.users + i.titles) >= 2
                THEN SUM(CASE WHEN i.titles IS NOT NULL THEN i.users END) END AS users,
           CASE WHEN COUNT(i.users + i.titles) >= 2
                THEN SUM(CASE WHEN i.users IS NOT NULL THEN i.titles END) END AS titles
      FROM (SELECT day, CAST(strftime('%s', day || ' 03:07:00') AS INTEGER) AS at
              FROM daily) AS d
      LEFT JOIN instances AS i
        ON i.flagged = 0
       AND MIN(i.last_seen, d.at) - i.first_seen >= 604800
       AND MIN(i.last_seen, d.at) >= d.at - 2592000
     GROUP BY d.day
  ) AS recount
 WHERE daily.day = recount.day;
