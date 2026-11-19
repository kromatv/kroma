use std::path::Path;

use tokio::io::AsyncReadExt;

use super::boxes::{children, first, read_time, read_u32, top, write_time, Child};

const HEAD_BYTES: u64 = 256 * 1024;

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Shift {
    ticks: u64,
    timescale: u32,
    tracks: Vec<(u32, u32)>,
}

impl Shift {
    pub(super) fn seconds(&self) -> f64 {
        self.ticks as f64 / f64::from(self.timescale)
    }

    fn ticks_in(&self, timescale: u32) -> u64 {
        let ticks = u128::from(self.ticks) * u128::from(timescale) / u128::from(self.timescale);
        u64::try_from(ticks).unwrap_or(u64::MAX)
    }

    fn ticks_on(&self, track: u32) -> Option<u64> {
        let (_, timescale) = self.tracks.iter().find(|(id, _)| *id == track)?;
        Some(self.ticks_in(*timescale))
    }
}

pub(super) async fn shift_of(dir: &Path, first_segment: &str) -> Option<Shift> {
    let init = tokio::fs::read(dir.join("init.mp4")).await.ok()?;
    let mut head = Vec::new();
    tokio::fs::File::open(dir.join(first_segment))
        .await
        .ok()?
        .take(HEAD_BYTES)
        .read_to_end(&mut head)
        .await
        .ok()?;
    shift(&init, &head)
}

pub(super) fn shift(init: &[u8], first_segment: &[u8]) -> Option<Shift> {
    let tracks = timescales(init);
    let mut earliest: Option<(u64, u32)> = None;
    for (track, ticks) in decode_times(first_segment)? {
        let (_, timescale) = *tracks.iter().find(|(id, _)| *id == track)?;
        if earliest.is_none_or(|held| before((ticks, timescale), held)) {
            earliest = Some((ticks, timescale));
        }
    }
    let (ticks, timescale) = earliest?;
    Some(Shift {
        ticks,
        timescale,
        tracks,
    })
}

pub(super) fn retimed(mut segment: Vec<u8>, shift: Option<&Shift>) -> Vec<u8> {
    if let Some(shift) = shift {
        retime(&mut segment, shift);
    }
    segment
}

fn retime(segment: &mut [u8], shift: &Shift) {
    let tops: Vec<Child> = children(segment, 0..segment.len()).collect();
    for child in tops {
        match &child.kind {
            b"sidx" => retime_index(segment, &child, shift),
            b"moof" => retime_fragment(segment, &child, shift),
            _ => {}
        }
    }
}

fn retime_index(segment: &mut [u8], sidx: &Child, shift: &Shift) {
    let Some(timescale) = read_u32(segment, sidx.body + 8).filter(|ts| *ts > 0) else {
        return;
    };
    move_back(
        segment,
        (sidx.body + 12, sidx.version(segment)),
        shift.ticks_in(timescale),
    );
}

fn retime_fragment(segment: &mut [u8], moof: &Child, shift: &Shift) {
    let trafs: Vec<Child> = children(segment, moof.inner())
        .filter(|child| &child.kind == b"traf")
        .collect();
    for traf in trafs {
        let Some((track, tfdt)) = track_clock(segment, &traf) else {
            continue;
        };
        if let Some(by) = shift.ticks_on(track) {
            move_back(segment, (tfdt.body + 4, tfdt.version(segment)), by);
        }
    }
}

fn move_back(segment: &mut [u8], (at, version): (usize, u8), by: u64) {
    if let Some(time) = read_time(segment, at, version) {
        write_time(segment, at, version, time.saturating_sub(by));
    }
}

fn decode_times(segment: &[u8]) -> Option<Vec<(u32, u64)>> {
    let moof = top(segment, b"moof")?;
    children(segment, moof.inner())
        .filter(|child| &child.kind == b"traf")
        .map(|traf| {
            let (track, tfdt) = track_clock(segment, &traf)?;
            Some((
                track,
                read_time(segment, tfdt.body + 4, tfdt.version(segment))?,
            ))
        })
        .collect()
}

fn track_clock(segment: &[u8], traf: &Child) -> Option<(u32, Child)> {
    let track = read_u32(segment, first(segment, traf, b"tfhd")?.body + 4)?;
    Some((track, first(segment, traf, b"tfdt")?))
}

fn timescales(init: &[u8]) -> Vec<(u32, u32)> {
    let Some(moov) = top(init, b"moov") else {
        return Vec::new();
    };
    children(init, moov.inner())
        .filter(|child| &child.kind == b"trak")
        .filter_map(|trak| track_timescale(init, &trak))
        .collect()
}

fn track_timescale(init: &[u8], trak: &Child) -> Option<(u32, u32)> {
    let tkhd = first(init, trak, b"tkhd")?;
    let mdhd = first(init, &first(init, trak, b"mdia")?, b"mdhd")?;
    let track = read_u32(init, tkhd.body + header_field(init, &tkhd))?;
    let timescale = read_u32(init, mdhd.body + header_field(init, &mdhd))?;
    (timescale > 0).then_some((track, timescale))
}

fn header_field(init: &[u8], full_box: &Child) -> usize {
    match full_box.version(init) {
        1 => 20,
        _ => 12,
    }
}

fn before((ticks, timescale): (u64, u32), (held, held_scale): (u64, u32)) -> bool {
    u128::from(ticks) * u128::from(held_scale) < u128::from(held) * u128::from(timescale)
}

#[cfg(test)]
pub(super) mod testing;

#[cfg(test)]
mod tests;
