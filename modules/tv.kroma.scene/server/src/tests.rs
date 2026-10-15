use crate::*;

mod lines;
mod parse;
mod score;

fn p(name: &str) -> ParsedRelease {
    parse_release_name(name)
}

fn profile() -> Profile {
    Profile {
        resolution: Res::R1080,
        unstated_resolution: UnstatedResolution::Refuse,
        preferred_codec: Some(Codec::Hevc),
        min_seeders: 2,
        max_size_bytes_movie: 15 * GB,
        max_size_bytes_episode: 3 * GB,
        required_keywords: vec![],
        forbidden_keywords: vec!["cam".into(), "hdcam".into(), "screener".into()],
    }
}

const GB: u64 = 1_073_741_824;

fn cand(size_gb: u64, seeders: u32) -> Candidate {
    Candidate {
        size_bytes: Some(size_gb * GB),
        seeders: Some(seeders),
        indexer_priority: 0,
    }
}

fn res_delta(s: &Scored) -> i32 {
    s.breakdown
        .iter()
        .find(|l| l.rule == "resolution")
        .unwrap()
        .delta
}

fn line(s: &Scored, rule: &str) -> Option<i32> {
    s.breakdown.iter().find(|l| l.rule == rule).map(|l| l.delta)
}
