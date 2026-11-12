use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};

use anyhow::{bail, Result};

use super::boxes::{boxed, full_box, Body};
use super::layout::{plan, Chunk};
use super::read::Track;
use super::tables::stbl;

pub(crate) const MOVIE_TIMESCALE: u32 = 1000;
const MATRIX: [u32; 9] = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000];

pub(crate) fn write(out: &mut impl Write, inputs: &mut [File], tracks: &[Track]) -> Result<u64> {
    let chunks = plan(tracks);
    let payload: u64 = chunks.iter().map(|c| c.bytes).sum();
    let wide = payload > u64::from(u32::MAX) - 64 * 1024 * 1024;
    let ftyp = ftyp();
    let header = if wide { 16 } else { 8 };
    let probe = moov(tracks, &chunks, 0, wide);
    let start = (ftyp.len() + probe.len()) as u64 + header;
    let moov = moov(tracks, &chunks, start, wide);
    if moov.len() != probe.len() {
        bail!("the movie header changed size between its two passes");
    }
    out.write_all(&ftyp)?;
    out.write_all(&moov)?;
    if wide {
        out.write_all(&1u32.to_be_bytes())?;
        out.write_all(b"mdat")?;
        out.write_all(&(payload + 16).to_be_bytes())?;
    } else {
        out.write_all(&((payload + 8) as u32).to_be_bytes())?;
        out.write_all(b"mdat")?;
    }
    for chunk in &chunks {
        let input = &mut inputs[chunk.track];
        input.seek(SeekFrom::Start(chunk.input))?;
        let copied = io::copy(&mut Read::take(&mut *input, chunk.bytes), out)?;
        if copied != chunk.bytes {
            bail!("an input ended inside a sample");
        }
    }
    Ok(start + payload)
}

fn ftyp() -> Vec<u8> {
    boxed(
        b"ftyp",
        &[
            b"isom",
            &0x200u32.to_be_bytes(),
            b"isom",
            b"iso2",
            b"avc1",
            b"mp41",
        ],
    )
}

fn scale(value: u64, from: u32, to: u32) -> u64 {
    (u128::from(value) * u128::from(to) / u128::from(from.max(1))) as u64
}

fn moov(tracks: &[Track], chunks: &[Chunk], payload_start: u64, wide: bool) -> Vec<u8> {
    let movie_duration = tracks
        .iter()
        .map(|t| scale(t.duration(), t.timescale, MOVIE_TIMESCALE))
        .max()
        .unwrap_or(0);
    let mut offsets: Vec<Vec<u64>> = vec![Vec::new(); tracks.len()];
    let mut cursor = payload_start;
    for chunk in chunks {
        offsets[chunk.track].push(cursor);
        cursor += chunk.bytes;
    }
    let mut parts = vec![mvhd(movie_duration, tracks.len() as u32 + 1)];
    for (index, track) in tracks.iter().enumerate() {
        let own: Vec<&Chunk> = chunks.iter().filter(|c| c.track == index).collect();
        parts.push(trak(index as u32 + 1, track, &own, &offsets[index], wide));
    }
    let refs: Vec<&[u8]> = parts.iter().map(Vec::as_slice).collect();
    boxed(b"moov", &refs)
}

fn matrix(body: &mut Body) {
    for value in MATRIX {
        body.u32(value);
    }
}

fn mvhd(duration: u64, next_track: u32) -> Vec<u8> {
    let mut body = Body::default();
    let long = duration > u64::from(u32::MAX);
    if long {
        body.u64(0).u64(0).u32(MOVIE_TIMESCALE).u64(duration);
    } else {
        body.u32(0).u32(0).u32(MOVIE_TIMESCALE).u32(duration as u32);
    }
    body.u32(0x0001_0000).u16(0x0100).zeros(10);
    matrix(&mut body);
    body.zeros(24).u32(next_track);
    full_box(b"mvhd", u8::from(long), 0, &body.0)
}

fn trak(id: u32, track: &Track, chunks: &[&Chunk], offsets: &[u64], wide: bool) -> Vec<u8> {
    let duration = scale(track.duration(), track.timescale, MOVIE_TIMESCALE);
    let mut parts = vec![tkhd(id, duration, track)];
    if let Some(edts) = edts(track) {
        parts.push(edts);
    }
    parts.push(mdia(track, chunks, offsets, wide));
    let refs: Vec<&[u8]> = parts.iter().map(Vec::as_slice).collect();
    boxed(b"trak", &refs)
}

fn tkhd(id: u32, duration: u64, track: &Track) -> Vec<u8> {
    let audio = &track.handler == b"soun";
    let mut body = Body::default();
    let long = duration > u64::from(u32::MAX);
    if long {
        body.u64(0).u64(0).u32(id).u32(0).u64(duration);
    } else {
        body.u32(0).u32(0).u32(id).u32(0).u32(duration as u32);
    }
    body.zeros(8)
        .u16(0)
        .u16(0)
        .u16(if audio { 0x0100 } else { 0 })
        .u16(0);
    matrix(&mut body);
    if audio {
        body.u32(0).u32(0);
    } else {
        body.u32(track.width).u32(track.height);
    }
    full_box(b"tkhd", u8::from(long), 3, &body.0)
}

fn edts(track: &Track) -> Option<Vec<u8>> {
    let mut entries: Vec<(u64, i64, u32)> = Vec::new();
    if track.edits.is_empty() {
        if track.start > 0 {
            entries.push((
                scale(track.start, track.timescale, MOVIE_TIMESCALE),
                -1,
                0x0001_0000,
            ));
            entries.push((
                scale(track.duration(), track.timescale, MOVIE_TIMESCALE),
                0,
                0x0001_0000,
            ));
        }
    } else {
        let start = i64::try_from(track.start).unwrap_or(i64::MAX);
        for edit in &track.edits {
            let media_time = if edit.media_time < 0 {
                -1
            } else {
                (edit.media_time - start).max(0)
            };
            let segment = if edit.segment_duration == 0 {
                let played = track
                    .duration()
                    .saturating_sub(u64::try_from(media_time.max(0)).unwrap_or(0));
                scale(played, track.timescale, MOVIE_TIMESCALE)
            } else {
                scale(
                    edit.segment_duration,
                    track.movie_timescale,
                    MOVIE_TIMESCALE,
                )
            };
            entries.push((segment, media_time, edit.rate));
        }
    }
    if entries.is_empty() {
        return None;
    }
    let long = entries
        .iter()
        .any(|(segment, time, _)| *segment > u64::from(u32::MAX) || *time > i64::from(i32::MAX));
    let mut body = Body::default();
    body.u32(entries.len() as u32);
    for (segment, time, rate) in entries {
        if long {
            body.u64(segment).i64(time);
        } else {
            body.u32(segment as u32).i32(time as i32);
        }
        body.u32(rate);
    }
    Some(boxed(
        b"edts",
        &[&full_box(b"elst", u8::from(long), 0, &body.0)],
    ))
}

fn mdia(track: &Track, chunks: &[&Chunk], offsets: &[u64], wide: bool) -> Vec<u8> {
    let duration = track.duration();
    let mut mdhd = Body::default();
    let long = duration > u64::from(u32::MAX);
    if long {
        mdhd.u64(0).u64(0).u32(track.timescale).u64(duration);
    } else {
        mdhd.u32(0).u32(0).u32(track.timescale).u32(duration as u32);
    }
    mdhd.u16(track.language).u16(0);
    let mdhd = full_box(b"mdhd", u8::from(long), 0, &mdhd.0);
    let stbl = stbl(track, chunks, offsets, wide);
    let minf = boxed(b"minf", &[&track.media_header, &track.dinf, &stbl]);
    boxed(b"mdia", &[&mdhd, &track.hdlr, &minf])
}
