use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

use crate::{Evaluation, QualityProfile};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Reason {
    Quality,
    Formats,
    Revision,
    UpgradesOff,
    CutoffReached,
    LowerQuality,
    NoBetterFormats,
    NotAllowed,
}

/// What grabbing a release would do to what the library holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "reason", rename_all = "camelCase")]
pub enum Verdict {
    Fill,
    Upgrade(Reason),
    Beside(Reason),
    NotBetter(Reason),
}

impl Verdict {
    pub fn is_wanted(self) -> bool {
        !matches!(self, Verdict::NotBetter(_))
    }
}

/// Whether `candidate` improves on `on_disk`, the files one title holds.
pub fn upgrade_verdict(
    candidate: &Evaluation,
    on_disk: &[Evaluation],
    profile: &QualityProfile,
) -> Verdict {
    let Some(best) = best_of(on_disk) else {
        return Verdict::Fill;
    };
    let Some(rank) = candidate.quality_rank else {
        return Verdict::NotBetter(Reason::NotAllowed);
    };
    if !profile.upgrades_allowed {
        return Verdict::NotBetter(Reason::UpgradesOff);
    }
    let held_score = held_score(on_disk);
    let increment = profile.min_upgrade_increment.max(1);
    let format_room = held_score < profile.upgrade_until_score;
    let better_formats = candidate.format_score >= best.format_score + increment;
    match rank.cmp(&best.quality_rank.unwrap_or(0)) {
        Ordering::Greater if best.quality_rank.unwrap_or(0) < profile.cutoff_rank() => {
            Verdict::Upgrade(Reason::Quality)
        }
        Ordering::Greater | Ordering::Equal if better_formats && format_room => {
            Verdict::Upgrade(Reason::Formats)
        }
        Ordering::Equal
            if candidate.revision > best.revision
                && candidate.format_score >= best.format_score =>
        {
            Verdict::Upgrade(Reason::Revision)
        }
        Ordering::Greater => Verdict::NotBetter(Reason::CutoffReached),
        Ordering::Equal => Verdict::NotBetter(Reason::NoBetterFormats),
        Ordering::Less
            if profile.add_beside
                && format_room
                && candidate.format_score >= held_score + increment =>
        {
            Verdict::Beside(Reason::Formats)
        }
        Ordering::Less => Verdict::NotBetter(Reason::LowerQuality),
    }
}

/// True when a title on disk could still be upgraded under `profile`: its best
/// file is below the cutoff, or no file reaches the upgrade-until score.
pub fn cutoff_unmet(on_disk: &[Evaluation], profile: &QualityProfile) -> bool {
    let Some(best) = best_of(on_disk) else {
        return false;
    };
    profile.upgrades_allowed
        && (best.quality_rank.unwrap_or(0) < profile.cutoff_rank()
            || held_score(on_disk) < profile.upgrade_until_score)
}

fn best_of(on_disk: &[Evaluation]) -> Option<&Evaluation> {
    on_disk.iter().max_by_key(|evaluation| {
        (
            evaluation.quality_rank.unwrap_or(0),
            evaluation.format_score,
            evaluation.revision,
        )
    })
}

fn held_score(on_disk: &[Evaluation]) -> i32 {
    on_disk
        .iter()
        .map(|evaluation| evaluation.format_score)
        .max()
        .unwrap_or(i32::MIN)
}
