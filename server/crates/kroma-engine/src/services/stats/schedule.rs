use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

const PERIOD: Duration = Duration::hours(23);

// A box that is asleep, rebooting or unplugged at its own hour would otherwise
// report once and never again, and go on to be dropped from the count entirely.
// The intermittent installs are the ones this most needs to see.
const CATCH_UP: Duration = Duration::hours(25);

// The hour of the day this install reports in, spread across all 24 by its own
// identifier. A fixed hour for everyone would land the whole world on the
// collector in the same minute, and would make every install that started
// reporting that day share a first-seen minute, which is the shape the
// collector's fleet detection looks for.
fn slot_hour(id: &str) -> u8 {
    id.bytes().fold(0u16, |acc, b| (acc + b as u16) % 24) as u8
}

// Once a day, in this install's own hour, and at the next run whatever the hour
// once a day and a bit has passed without one. A server that has never reported
// goes at the next run, so switching the toggle on and watching it work does not
// mean waiting until tomorrow.
pub(super) fn due(id: &str, last_sent: &str, now: OffsetDateTime) -> bool {
    let Ok(last) = OffsetDateTime::parse(last_sent.trim(), &Rfc3339) else {
        return true;
    };
    let elapsed = now - last;
    elapsed >= CATCH_UP || (elapsed >= PERIOD && now.hour() == slot_hour(id))
}

#[cfg(test)]
mod tests {
    use super::*;

    // A fixed instant, not the wall clock: hanging the fixtures off `now` makes
    // whether a day has elapsed depend on the time of day the suite runs at.
    const DAY: i64 = 1_800_000_000;

    fn id() -> String {
        "a".repeat(64)
    }

    // The last report, placed in this install's own hour, so a later fixture can
    // be read as "n hours after the one before it".
    fn sent(id: &str) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(DAY)
            .unwrap()
            .replace_time(time::Time::from_hms(slot_hour(id), 30, 0).unwrap())
    }

    fn stamp(id: &str) -> String {
        sent(id).format(&Rfc3339).unwrap()
    }

    #[test]
    fn a_server_that_has_never_reported_goes_at_the_next_run_whatever_the_hour() {
        let now = OffsetDateTime::now_utc();

        assert!(due("any-id", "", now));
        assert!(due("any-id", "not a timestamp", now));
    }

    #[test]
    fn a_server_that_reported_today_waits_for_its_own_hour_tomorrow() {
        let id = id();
        let later = |hours: i64| sent(&id) + Duration::hours(hours);

        assert!(!due(&id, &stamp(&id), later(1)), "an hour later");
        assert!(!due(&id, &stamp(&id), later(22)), "later the same day");
        assert!(!due(&id, &stamp(&id), later(23)), "the hour before its own");
        assert!(due(&id, &stamp(&id), later(24)), "its own hour");
    }

    #[test]
    fn a_server_asleep_at_its_own_hour_reports_at_the_next_run_rather_than_never() {
        let id = id();

        for late in 25..72 {
            assert!(
                due(&id, &stamp(&id), sent(&id) + Duration::hours(late)),
                "{late} hours since the last report and still silent"
            );
        }
    }

    #[test]
    fn the_reporting_hour_is_spread_across_the_day_rather_than_shared() {
        let hours: std::collections::HashSet<u8> = (0..200u32)
            .map(|i| slot_hour(&format!("{i:064x}")))
            .collect();

        assert!(hours.len() > 12, "only {} distinct hours", hours.len());
        assert!(hours.iter().all(|h| *h < 24));
    }
}
