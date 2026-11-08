use std::fs::File;

use anyhow::{anyhow, bail, Result};

use super::boxes::{children, find, need, read_box, top_level, Child, Kind};
use super::fragment::{read_fragment, Defaults};

const MAX_HEADER_BOX: u64 = 16 * 1024 * 1024;

pub(crate) struct Edit {
    pub(crate) segment_duration: u64,
    pub(crate) media_time: i64,
    pub(crate) rate: u32,
}

pub(crate) struct Sample {
    pub(crate) offset: u64,
    pub(crate) size: u32,
    pub(crate) duration: u32,
    pub(crate) cto: i32,
    pub(crate) sync: bool,
}

pub(crate) struct Track {
    pub(crate) handler: Kind,
    pub(crate) timescale: u32,
    pub(crate) movie_timescale: u32,
    pub(crate) language: u16,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) hdlr: Vec<u8>,
    pub(crate) media_header: Vec<u8>,
    pub(crate) dinf: Vec<u8>,
    pub(crate) stsd: Vec<u8>,
    pub(crate) edits: Vec<Edit>,
    pub(crate) start: u64,
    pub(crate) samples: Vec<Sample>,
}

impl Track {
    pub(crate) fn duration(&self) -> u64 {
        self.samples.iter().map(|s| u64::from(s.duration)).sum()
    }
}

pub(crate) fn read_track(file: &mut File) -> Result<Track> {
    let top = top_level(file)?;
    let moov = top
        .iter()
        .find(|b| &b.kind == b"moov")
        .ok_or_else(|| anyhow!("no moov box"))?;
    let moov = read_box(file, moov, MAX_HEADER_BOX)?;
    let (mut track, track_id, defaults) = read_moov(&moov)?;
    let mut next: Option<u64> = None;
    for moof in top.iter().filter(|b| &b.kind == b"moof") {
        let body = read_box(file, moof, MAX_HEADER_BOX)?;
        read_fragment(&body, moof.start, track_id, defaults, &mut track, &mut next)?;
    }
    if track.samples.is_empty() {
        bail!(
            "the {} track holds no samples",
            super::boxes::printable(track.handler)
        );
    }
    Ok(track)
}

fn read_moov(moov: &[u8]) -> Result<(Track, u32, Defaults)> {
    let movie_timescale = mvhd_timescale(&need(moov, b"mvhd")?)?;
    let trak = need(moov, b"trak")?;
    let (track_id, width, height) = read_tkhd(&need(trak.body, b"tkhd")?)?;
    let edits = match find(trak.body, b"edts")? {
        Some(edts) => match find(edts.body, b"elst")? {
            Some(elst) => read_elst(&elst)?,
            None => Vec::new(),
        },
        None => Vec::new(),
    };
    let mdia = need(trak.body, b"mdia")?;
    let (timescale, language) = read_mdhd(&need(mdia.body, b"mdhd")?)?;
    let hdlr = need(mdia.body, b"hdlr")?;
    let handler = {
        let (_, _, mut reader) = hdlr.full()?;
        reader.skip(4)?;
        reader.kind()?
    };
    let minf = need(mdia.body, b"minf")?;
    let media_header = children(minf.body)?
        .into_iter()
        .find(|c| matches!(&c.kind, b"vmhd" | b"smhd" | b"nmhd" | b"sthd"))
        .ok_or_else(|| anyhow!("no media header box"))?;
    let dinf = need(minf.body, b"dinf")?;
    let stbl = need(minf.body, b"stbl")?;
    let stsd = need(stbl.body, b"stsd")?;
    let defaults = match find(moov, b"mvex")? {
        Some(mvex) => trex_for(mvex.body, track_id)?,
        None => Defaults::default(),
    };
    if timescale == 0 || movie_timescale == 0 {
        bail!("a timescale of zero");
    }
    let track = Track {
        handler,
        timescale,
        movie_timescale,
        language,
        width,
        height,
        hdlr: hdlr.whole.to_vec(),
        media_header: media_header.whole.to_vec(),
        dinf: dinf.whole.to_vec(),
        stsd: stsd.whole.to_vec(),
        edits,
        start: 0,
        samples: Vec::new(),
    };
    Ok((track, track_id, defaults))
}

fn mvhd_timescale(mvhd: &Child<'_>) -> Result<u32> {
    let (version, _, mut reader) = mvhd.full()?;
    reader.skip(if version == 1 { 16 } else { 8 })?;
    reader.u32()
}

fn read_tkhd(tkhd: &Child<'_>) -> Result<(u32, u32, u32)> {
    let (version, _, mut reader) = tkhd.full()?;
    reader.skip(if version == 1 { 16 } else { 8 })?;
    let id = reader.u32()?;
    reader.skip(4)?;
    reader.skip(if version == 1 { 8 } else { 4 })?;
    reader.skip(8 + 2 + 2 + 2 + 2 + 36)?;
    let width = reader.u32()?;
    let height = reader.u32()?;
    Ok((id, width, height))
}

fn read_mdhd(mdhd: &Child<'_>) -> Result<(u32, u16)> {
    let (version, _, mut reader) = mdhd.full()?;
    reader.skip(if version == 1 { 16 } else { 8 })?;
    let timescale = reader.u32()?;
    reader.skip(if version == 1 { 8 } else { 4 })?;
    let language = reader.u16()?;
    Ok((timescale, language))
}

fn read_elst(elst: &Child<'_>) -> Result<Vec<Edit>> {
    let (version, _, mut reader) = elst.full()?;
    let count = reader.u32()?;
    let mut out = Vec::new();
    for _ in 0..count.min(64) {
        let (segment_duration, media_time) = if version == 1 {
            (reader.u64()?, reader.i64()?)
        } else {
            (u64::from(reader.u32()?), i64::from(reader.i32()?))
        };
        out.push(Edit {
            segment_duration,
            media_time,
            rate: reader.u32()?,
        });
    }
    Ok(out)
}

fn trex_for(mvex: &[u8], track_id: u32) -> Result<Defaults> {
    for trex in children(mvex)?.into_iter().filter(|c| &c.kind == b"trex") {
        let (_, _, mut reader) = trex.full()?;
        if reader.u32()? != track_id {
            continue;
        }
        reader.skip(4)?;
        return Ok(Defaults {
            duration: reader.u32()?,
            size: reader.u32()?,
            flags: reader.u32()?,
        });
    }
    Ok(Defaults::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::mp4::fixture::{audio_fragments, video_fragments, write_temp};

    #[test]
    fn every_sample_of_every_fragment_is_found_where_its_bytes_are() {
        let input = video_fragments();
        let (_dir, mut file) = write_temp("video.mp4", &input.bytes);

        let track = read_track(&mut file).unwrap();

        let found: Vec<Vec<u8>> = track
            .samples
            .iter()
            .map(|s| {
                input.bytes[s.offset as usize..(s.offset + u64::from(s.size)) as usize].to_vec()
            })
            .collect();
        assert_eq!(found, input.samples);
    }

    #[test]
    fn a_sample_flagged_non_sync_is_not_a_keyframe() {
        let input = video_fragments();
        let (_dir, mut file) = write_temp("video.mp4", &input.bytes);

        let track = read_track(&mut file).unwrap();

        let sync: Vec<bool> = track.samples.iter().map(|s| s.sync).collect();
        assert_eq!(sync, vec![true, false, false, true, false, false]);
    }

    #[test]
    fn durations_come_from_the_fragment_defaults_when_the_run_names_none() {
        let input = audio_fragments();
        let (_dir, mut file) = write_temp("audio.m4a", &input.bytes);

        let track = read_track(&mut file).unwrap();

        assert!(track.samples.iter().all(|s| s.duration == 1024));
        assert_eq!(&track.handler, b"soun");
    }

    #[test]
    fn the_edit_list_of_the_init_segment_is_kept() {
        let input = video_fragments();
        let (_dir, mut file) = write_temp("video.mp4", &input.bytes);

        let track = read_track(&mut file).unwrap();

        assert_eq!(track.edits.len(), 1);
        assert_eq!(track.edits[0].media_time, 1001);
    }
}
