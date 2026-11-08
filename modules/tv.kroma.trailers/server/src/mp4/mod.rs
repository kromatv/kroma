mod boxes;
#[cfg(test)]
pub(crate) mod fixture;
mod fragment;
mod layout;
mod read;
mod tables;
mod write;

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use anyhow::{bail, Context, Result};

pub(crate) struct Remuxed {
    pub(crate) bytes: u64,
    pub(crate) duration_ms: u64,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

pub(crate) fn remux(video: &Path, audio: &Path, out: &Path) -> Result<Remuxed> {
    let mut inputs = [
        File::open(video).context("open the video stream")?,
        File::open(audio).context("open the audio stream")?,
    ];
    let tracks = [
        read::read_track(&mut inputs[0]).context("read the video stream")?,
        read::read_track(&mut inputs[1]).context("read the audio stream")?,
    ];
    if &tracks[0].handler != b"vide" || &tracks[1].handler != b"soun" {
        bail!("expected one video and one audio stream");
    }
    let mut file = BufWriter::new(File::create(out).context("create the trailer file")?);
    let bytes = write::write(&mut file, &mut inputs, &tracks)?;
    file.flush()?;
    let duration_ms = tracks
        .iter()
        .map(|t| t.duration() * u64::from(write::MOVIE_TIMESCALE) / u64::from(t.timescale))
        .max()
        .unwrap_or(0);
    Ok(Remuxed {
        bytes,
        duration_ms,
        width: tracks[0].width >> 16,
        height: tracks[0].height >> 16,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use boxes::{children, need, Reader};
    use fixture::{audio_fragments, video_fragments};
    use kroma_module_sdk::testing::temp_dir;

    fn sample_bytes(file: &[u8], stbl: &[u8]) -> Vec<Vec<u8>> {
        let stsz = need(stbl, b"stsz").unwrap();
        let (_, _, mut reader) = stsz.full().unwrap();
        let uniform = reader.u32().unwrap();
        let count = reader.u32().unwrap();
        let sizes: Vec<u32> = (0..count)
            .map(|_| {
                if uniform == 0 {
                    reader.u32().unwrap()
                } else {
                    uniform
                }
            })
            .collect();
        let stsc = need(stbl, b"stsc").unwrap();
        let (_, _, mut reader) = stsc.full().unwrap();
        let entries: Vec<(u32, u32)> = (0..reader.u32().unwrap())
            .map(|_| {
                let first = reader.u32().unwrap();
                let per = reader.u32().unwrap();
                reader.u32().unwrap();
                (first, per)
            })
            .collect();
        let stco = need(stbl, b"stco").unwrap();
        let (_, _, mut reader) = stco.full().unwrap();
        let offsets: Vec<u32> = (0..reader.u32().unwrap())
            .map(|_| reader.u32().unwrap())
            .collect();
        let mut out = Vec::new();
        let mut sample = 0usize;
        for (index, offset) in offsets.iter().enumerate() {
            let chunk = index as u32 + 1;
            let per = entries
                .iter()
                .rev()
                .find(|(first, _)| *first <= chunk)
                .unwrap()
                .1;
            let mut at = *offset as usize;
            for _ in 0..per {
                let size = sizes[sample] as usize;
                out.push(file[at..at + size].to_vec());
                at += size;
                sample += 1;
            }
        }
        out
    }

    fn tracks_of(file: &[u8]) -> Vec<Vec<Vec<u8>>> {
        let moov = children(file)
            .unwrap()
            .into_iter()
            .find(|c| &c.kind == b"moov")
            .unwrap();
        children(moov.body)
            .unwrap()
            .into_iter()
            .filter(|c| &c.kind == b"trak")
            .map(|trak| {
                let mdia = need(trak.body, b"mdia").unwrap();
                let minf = need(mdia.body, b"minf").unwrap();
                sample_bytes(file, need(minf.body, b"stbl").unwrap().body)
            })
            .collect()
    }

    fn remuxed() -> (Vec<u8>, Remuxed) {
        let dir = temp_dir("trailers-remux");
        let video = dir.path().join("video.mp4");
        let audio = dir.path().join("audio.m4a");
        let out = dir.path().join("trailer.mp4");
        std::fs::write(&video, video_fragments().bytes).unwrap();
        std::fs::write(&audio, audio_fragments().bytes).unwrap();
        let summary = remux(&video, &audio, &out).unwrap();
        (std::fs::read(&out).unwrap(), summary)
    }

    #[test]
    fn every_sample_of_both_streams_lands_where_the_movie_header_says() {
        let (file, _) = remuxed();

        let tracks = tracks_of(&file);

        assert_eq!(
            tracks,
            vec![video_fragments().samples, audio_fragments().samples]
        );
    }

    #[test]
    fn the_movie_header_comes_before_the_media() {
        let (file, _) = remuxed();

        let order: Vec<[u8; 4]> = children(&file).unwrap().iter().map(|c| c.kind).collect();

        assert_eq!(order, vec![*b"ftyp", *b"moov", *b"mdat"]);
    }

    #[test]
    fn the_audio_track_gets_its_own_id() {
        let (file, _) = remuxed();

        let moov = children(&file)
            .unwrap()
            .into_iter()
            .find(|c| &c.kind == b"moov")
            .unwrap();

        let ids: Vec<u32> = children(moov.body)
            .unwrap()
            .into_iter()
            .filter(|c| &c.kind == b"trak")
            .map(|trak| {
                let tkhd = need(trak.body, b"tkhd").unwrap();
                let (_, _, mut reader): (u8, u32, Reader<'_>) = tkhd.full().unwrap();
                reader.skip(8).unwrap();
                reader.u32().unwrap()
            })
            .collect();
        assert_eq!(ids, vec![1, 2]);
    }

    #[test]
    fn the_summary_reports_the_picture_and_the_length() {
        let (file, summary) = remuxed();

        let reported = (
            summary.bytes,
            summary.width,
            summary.height,
            summary.duration_ms,
        );

        assert_eq!(reported, (file.len() as u64, 1920, 1080, 250));
    }
}
