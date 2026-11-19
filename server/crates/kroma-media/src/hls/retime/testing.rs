use super::super::boxes::{children, read_time, read_u32};

pub(in crate::hls) const VIDEO: (u32, u32) = (1, 16_000);
pub(in crate::hls) const AUDIO: (u32, u32) = (2, 48_000);

pub(in crate::hls) fn mp4(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let size = u32::try_from(body.len() + 8).expect("a box under 4 GiB");
    [size.to_be_bytes().as_slice(), kind, body].concat()
}

pub(in crate::hls) fn full(kind: &[u8; 4], version: u8, fields: &[u8]) -> Vec<u8> {
    mp4(kind, &[[version, 0, 0, 0].as_slice(), fields].concat())
}

pub(in crate::hls) fn init(tracks: &[(u32, u32)]) -> Vec<u8> {
    let traks: Vec<u8> = tracks
        .iter()
        .flat_map(|&(track, timescale)| trak(track, timescale))
        .collect();
    [mp4(b"ftyp", b"iso5\0\0\x02\0"), mp4(b"moov", &traks)].concat()
}

fn trak(track: u32, timescale: u32) -> Vec<u8> {
    let tkhd = full(
        b"tkhd",
        0,
        &[[0; 8].as_slice(), &track.to_be_bytes(), &[0; 4]].concat(),
    );
    let mdhd = full(
        b"mdhd",
        0,
        &[[0; 8].as_slice(), &timescale.to_be_bytes(), &[0; 8]].concat(),
    );
    mp4(b"trak", &[tkhd, mp4(b"mdia", &mdhd)].concat())
}

pub(in crate::hls) fn segment(starts: &[((u32, u32), u64)]) -> Vec<u8> {
    let indexes: Vec<u8> = starts
        .iter()
        .flat_map(|&(track, ticks)| index(track, ticks))
        .collect();
    let trafs: Vec<u8> = starts
        .iter()
        .flat_map(|&((track, _), ticks)| traf(track, &full(b"tfdt", 1, &ticks.to_be_bytes())))
        .collect();
    let moof = mp4(
        b"moof",
        &[full(b"mfhd", 0, &1u32.to_be_bytes()), trafs].concat(),
    );
    [
        mp4(b"styp", b"msdh\0\0\0\0"),
        indexes,
        moof,
        mp4(b"mdat", &[0; 32]),
    ]
    .concat()
}

pub(in crate::hls) fn traf(track: u32, tfdt: &[u8]) -> Vec<u8> {
    mp4(
        b"traf",
        &[full(b"tfhd", 0, &track.to_be_bytes()), tfdt.to_vec()].concat(),
    )
}

fn index((track, timescale): (u32, u32), ticks: u64) -> Vec<u8> {
    let head = [track.to_be_bytes(), timescale.to_be_bytes()].concat();
    full(
        b"sidx",
        1,
        &[head.as_slice(), &ticks.to_be_bytes(), &[0; 12]].concat(),
    )
}

pub(in crate::hls) fn decode_times(segment: &[u8]) -> Vec<(u32, u64)> {
    super::decode_times(segment).unwrap_or_default()
}

pub(in crate::hls) fn index_times(segment: &[u8]) -> Vec<(u32, u64)> {
    children(segment, 0..segment.len())
        .filter(|child| &child.kind == b"sidx")
        .filter_map(|sidx| {
            let track = read_u32(segment, sidx.body + 4)?;
            Some((
                track,
                read_time(segment, sidx.body + 12, sidx.version(segment))?,
            ))
        })
        .collect()
}

pub(in crate::hls) fn segment_at(seconds: u64) -> Vec<u8> {
    segment(&[
        (VIDEO, seconds * u64::from(VIDEO.1)),
        (AUDIO, seconds * u64::from(AUDIO.1)),
    ])
}

pub(in crate::hls) fn shift_at(seconds: u64) -> super::Shift {
    super::shift(&init(&[VIDEO, AUDIO]), &segment_at(seconds)).expect("a shift")
}
