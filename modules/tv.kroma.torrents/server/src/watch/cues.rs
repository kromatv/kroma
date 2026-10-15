use std::collections::HashSet;

/// One WebVTT out of what several passes over one file found, in time order and
/// with nothing said twice. A pass starts on the block before the second it was
/// given, so two spans that meet hand back the same cue and only one of them
/// travels.
pub(super) fn merge(parts: &[String]) -> String {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut cues: Vec<(u64, &str)> = Vec::new();
    for block in parts.iter().flat_map(|part| part.split("\n\n")) {
        let block = block.trim();
        match starts_at(block) {
            Some(at) if seen.insert(block) => cues.push((at, block)),
            _ => {}
        }
    }
    cues.sort_by_key(|(at, _)| *at);
    let mut out = String::from("WEBVTT\n");
    for (_, block) in cues {
        out.push('\n');
        out.push_str(block);
        out.push('\n');
    }
    out
}

/// The last second any cue in `vtt` runs to, which is how far a pass really read.
/// A pass that stopped at a hole proves far less than the span it was given.
pub(super) fn reaches_ms(vtt: &str) -> u64 {
    vtt.lines()
        .filter_map(|line| line.split_once("-->"))
        .filter_map(|(_, end)| stamp_ms(end.split_whitespace().next()?))
        .max()
        .unwrap_or(0)
}

fn starts_at(block: &str) -> Option<u64> {
    let timing = block.lines().find(|line| line.contains("-->"))?;
    stamp_ms(timing.split("-->").next()?.trim())
}

fn stamp_ms(stamp: &str) -> Option<u64> {
    let (whole, millis) = stamp.split_once('.')?;
    let mut fields = whole.rsplit(':');
    let secs: u64 = fields.next()?.parse().ok()?;
    let mins: u64 = fields.next().map_or(Ok(0), str::parse).ok()?;
    let hours: u64 = fields.next().map_or(Ok(0), str::parse).ok()?;
    Some(((hours * 60 + mins) * 60 + secs) * 1000 + millis.parse::<u64>().ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count(vtt: &str) -> usize {
        vtt.lines().filter(|line| line.contains("-->")).count()
    }

    const FIRST: &str = "WEBVTT\n\n00:15.040 --> 00:18.040\nAt the left we can see...\n";
    const LATER: &str = "WEBVTT\n\n01:34.250 --> 01:35.540\nFollow me!\n\n\
                         01:39.000 --> 01:42.000\n(buzzing wires)\n";

    #[test]
    fn cues_found_by_two_passes_come_back_as_one_file_in_time_order() {
        let merged = merge(&[LATER.to_string(), FIRST.to_string()]);

        assert!(merged.starts_with("WEBVTT\n\n00:15.040"));
        assert_eq!(count(&merged), 3);
        assert_eq!(merged.matches("WEBVTT").count(), 1);
    }

    #[test]
    fn a_cue_two_spans_both_reached_is_written_once() {
        let merged = merge(&[FIRST.to_string(), FIRST.to_string()]);

        assert_eq!(count(&merged), 1);
    }

    #[test]
    fn nothing_found_is_still_a_file_a_player_can_read() {
        let merged = merge(&["WEBVTT\n".to_string()]);

        assert_eq!(merged, "WEBVTT\n");
        assert_eq!(count(&merged), 0);
    }

    #[test]
    fn a_cue_past_the_hour_is_ordered_by_its_hour_and_not_its_minutes() {
        let past = "WEBVTT\n\n01:00:05.000 --> 01:00:07.000\nlate\n";
        let early = "WEBVTT\n\n02:05.000 --> 02:07.000\nearly\n";

        let merged = merge(&[past.to_string(), early.to_string()]);

        assert!(merged.find("early").unwrap() < merged.find("late").unwrap());
    }

    #[test]
    fn a_block_that_is_not_a_cue_never_crosses() {
        let noted =
            "WEBVTT\n\nNOTE this file was made by a machine\n\n00:01.000 --> 00:02.000\nhi\n";

        let merged = merge(&[noted.to_string()]);

        assert!(!merged.contains("NOTE"));
        assert_eq!(count(&merged), 1);
    }
}
