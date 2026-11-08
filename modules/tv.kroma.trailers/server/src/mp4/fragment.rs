use anyhow::{anyhow, bail, Result};

use super::boxes::{children, find, need, Child};
use super::read::{Sample, Track};

const MAX_SAMPLES: usize = 2_000_000;
const NON_SYNC: u32 = 0x0001_0000;

#[derive(Clone, Copy, Default)]
pub(super) struct Defaults {
    pub(super) duration: u32,
    pub(super) size: u32,
    pub(super) flags: u32,
}

pub(super) fn read_fragment(
    moof: &[u8],
    moof_start: u64,
    track_id: u32,
    trex: Defaults,
    track: &mut Track,
    next: &mut Option<u64>,
) -> Result<()> {
    let mut previous_end: Option<u64> = None;
    for traf in children(moof)?.into_iter().filter(|c| &c.kind == b"traf") {
        let tfhd = need(traf.body, b"tfhd")?;
        let (_, flags, mut reader) = tfhd.full()?;
        if reader.u32()? != track_id {
            continue;
        }
        let base_offset = if flags & 0x01 != 0 {
            Some(reader.u64()?)
        } else {
            None
        };
        if flags & 0x02 != 0 {
            reader.skip(4)?;
        }
        let mut defaults = trex;
        if flags & 0x08 != 0 {
            defaults.duration = reader.u32()?;
        }
        if flags & 0x10 != 0 {
            defaults.size = reader.u32()?;
        }
        if flags & 0x20 != 0 {
            defaults.flags = reader.u32()?;
        }
        let base = match (base_offset, previous_end) {
            (Some(offset), _) => offset,
            (None, Some(end)) if flags & 0x0002_0000 == 0 => end,
            _ => moof_start,
        };
        if let Some(tfdt) = find(traf.body, b"tfdt")? {
            let (version, _, mut reader) = tfdt.full()?;
            let decode = if version == 1 {
                reader.u64()?
            } else {
                u64::from(reader.u32()?)
            };
            align(track, next, decode);
        }
        let mut cursor = base;
        for trun in children(traf.body)?
            .into_iter()
            .filter(|c| &c.kind == b"trun")
        {
            cursor = read_trun(&trun, base, cursor, defaults, track, next)?;
        }
        previous_end = Some(cursor);
    }
    Ok(())
}

fn align(track: &mut Track, next: &mut Option<u64>, decode: u64) {
    match *next {
        None => {
            track.start = decode;
            *next = Some(decode);
        }
        Some(expected) if decode > expected => {
            if let Some(last) = track.samples.last_mut() {
                let gap = u32::try_from(decode - expected).unwrap_or(0);
                last.duration = last.duration.saturating_add(gap);
            }
            *next = Some(decode);
        }
        Some(_) => {}
    }
}

fn read_trun(
    trun: &Child<'_>,
    base: u64,
    cursor: u64,
    defaults: Defaults,
    track: &mut Track,
    next: &mut Option<u64>,
) -> Result<u64> {
    let (version, flags, mut reader) = trun.full()?;
    let count = reader.u32()? as usize;
    if track.samples.len() + count > MAX_SAMPLES {
        bail!("more samples than this remuxer takes");
    }
    let mut position = if flags & 0x01 != 0 {
        let offset = i64::from(reader.i32()?);
        u64::try_from(i64::try_from(base)? + offset)
            .map_err(|_| anyhow!("a sample before the file"))?
    } else {
        cursor
    };
    let first_flags = if flags & 0x04 != 0 {
        Some(reader.u32()?)
    } else {
        None
    };
    for index in 0..count {
        let duration = if flags & 0x100 != 0 {
            reader.u32()?
        } else {
            defaults.duration
        };
        let size = if flags & 0x200 != 0 {
            reader.u32()?
        } else {
            defaults.size
        };
        let sample_flags = if flags & 0x400 != 0 {
            reader.u32()?
        } else if index == 0 {
            first_flags.unwrap_or(defaults.flags)
        } else {
            defaults.flags
        };
        let cto = if flags & 0x800 != 0 {
            if version == 0 {
                i32::try_from(reader.u32()?).unwrap_or(i32::MAX)
            } else {
                reader.i32()?
            }
        } else {
            0
        };
        track.samples.push(Sample {
            offset: position,
            size,
            duration,
            cto,
            sync: sample_flags & NON_SYNC == 0,
        });
        position += u64::from(size);
        *next = next.map(|n| n + u64::from(duration));
    }
    Ok(position)
}
