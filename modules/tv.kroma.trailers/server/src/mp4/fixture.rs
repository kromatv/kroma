use std::fs::File;

use kroma_module_sdk::testing::{temp_dir, TempDir};

use super::boxes::{boxed, full_box, Body};

pub(crate) struct Fixture {
    pub(crate) bytes: Vec<u8>,
    pub(crate) samples: Vec<Vec<u8>>,
}

pub(crate) fn write_temp(name: &str, bytes: &[u8]) -> (TempDir, File) {
    let dir = temp_dir("trailers-mp4");
    let path = dir.path().join(name);
    std::fs::write(&path, bytes).unwrap();
    let file = File::open(&path).unwrap();
    (dir, file)
}

struct Spec {
    handler: &'static [u8; 4],
    timescale: u32,
    entry: &'static [u8; 4],
    tfhd_flags: u32,
    tfhd_duration: u32,
    trun_flags: u32,
    edit: Option<i32>,
    fragments: Vec<Vec<(Vec<u8>, u32, i32)>>,
}

pub(crate) fn video_fragments() -> Fixture {
    build(Spec {
        handler: b"vide",
        timescale: 24000,
        entry: b"avc1",
        tfhd_flags: 0x0002_000a,
        tfhd_duration: 1001,
        trun_flags: 0xe01,
        edit: Some(1001),
        fragments: vec![
            vec![
                (vec![1; 40], 0x0200_0000, 2002),
                (vec![2; 9], 0x0101_0000, 0),
                (vec![3; 12], 0x0101_0000, 1001),
            ],
            vec![
                (vec![4; 33], 0x0200_0000, 2002),
                (vec![5; 7], 0x0101_0000, 0),
                (vec![6; 5], 0x0101_0000, 1001),
            ],
        ],
    })
}

pub(crate) fn audio_fragments() -> Fixture {
    build(Spec {
        handler: b"soun",
        timescale: 44100,
        entry: b"mp4a",
        tfhd_flags: 0x0002_002a,
        tfhd_duration: 1024,
        trun_flags: 0x201,
        edit: None,
        fragments: vec![
            vec![
                (vec![7; 6], 0, 0),
                (vec![8; 8], 0, 0),
                (vec![9; 4], 0, 0),
                (vec![10; 6], 0, 0),
            ],
            vec![
                (vec![11; 5], 0, 0),
                (vec![12; 7], 0, 0),
                (vec![13; 6], 0, 0),
                (vec![14; 3], 0, 0),
            ],
        ],
    })
}

fn build(spec: Spec) -> Fixture {
    let mut out = boxed(b"ftyp", &[b"dash", &[0, 0, 0, 0], b"iso6", b"mp41"]);
    out.extend(moov(&spec));
    out.extend(boxed(b"sidx", &[&[0; 12]]));
    let mut samples = Vec::new();
    let mut decode = 0u64;
    for (index, fragment) in spec.fragments.iter().enumerate() {
        let sequence = index as u32 + 1;
        let data_offset = moof(&spec, sequence, decode, fragment, 0).len() as i32 + 8;
        out.extend(moof(&spec, sequence, decode, fragment, data_offset));
        let payload: Vec<u8> = fragment
            .iter()
            .flat_map(|(bytes, _, _)| bytes.clone())
            .collect();
        out.extend(boxed(b"mdat", &[&payload]));
        samples.extend(fragment.iter().map(|(bytes, _, _)| bytes.clone()));
        decode += u64::from(spec.tfhd_duration) * fragment.len() as u64;
    }
    Fixture {
        bytes: out,
        samples,
    }
}

fn moof(
    spec: &Spec,
    sequence: u32,
    decode: u64,
    fragment: &[(Vec<u8>, u32, i32)],
    data_offset: i32,
) -> Vec<u8> {
    let mfhd = full_box(b"mfhd", 0, 0, &sequence.to_be_bytes());
    let mut tfhd = Body::default();
    tfhd.u32(1).u32(1).u32(spec.tfhd_duration);
    if spec.tfhd_flags & 0x20 != 0 {
        tfhd.u32(0);
    }
    let tfhd = full_box(b"tfhd", 0, spec.tfhd_flags, &tfhd.0);
    let tfdt = full_box(b"tfdt", 1, 0, &decode.to_be_bytes());
    let mut trun = Body::default();
    trun.u32(fragment.len() as u32).i32(data_offset);
    for (bytes, flags, cto) in fragment {
        trun.u32(bytes.len() as u32);
        if spec.trun_flags & 0x400 != 0 {
            trun.u32(*flags);
        }
        if spec.trun_flags & 0x800 != 0 {
            trun.i32(*cto);
        }
    }
    let trun = full_box(b"trun", 0, spec.trun_flags, &trun.0);
    let traf = boxed(b"traf", &[&tfhd, &tfdt, &trun]);
    boxed(b"moof", &[&mfhd, &traf])
}

fn moov(spec: &Spec) -> Vec<u8> {
    let mut mvhd = Body::default();
    mvhd.u32(0)
        .u32(0)
        .u32(spec.timescale)
        .u32(0)
        .u32(0x0001_0000)
        .u16(0x0100)
        .zeros(10)
        .zeros(36)
        .zeros(24)
        .u32(2);
    let mvhd = full_box(b"mvhd", 0, 0, &mvhd.0);
    let mut tkhd = Body::default();
    tkhd.u32(0)
        .u32(0)
        .u32(1)
        .u32(0)
        .u32(0)
        .zeros(8)
        .u16(0)
        .u16(0)
        .u16(0)
        .u16(0)
        .zeros(36);
    tkhd.u32(1920 << 16).u32(1080 << 16);
    let tkhd = full_box(b"tkhd", 0, 3, &tkhd.0);
    let edts = spec.edit.map(|media_time| {
        let mut elst = Body::default();
        elst.u32(1).u32(0).i32(media_time).u32(0x0001_0000);
        boxed(b"edts", &[&full_box(b"elst", 0, 0, &elst.0)])
    });
    let mut mdhd = Body::default();
    mdhd.u32(0)
        .u32(0)
        .u32(spec.timescale)
        .u32(0)
        .u16(0x55c4)
        .u16(0);
    let mdhd = full_box(b"mdhd", 0, 0, &mdhd.0);
    let mut hdlr = Body::default();
    hdlr.u32(0)
        .bytes(spec.handler)
        .zeros(12)
        .bytes(b"fixture\0");
    let hdlr = full_box(b"hdlr", 0, 0, &hdlr.0);
    let media_header = if spec.handler == b"vide" {
        full_box(b"vmhd", 0, 1, &[0; 8])
    } else {
        full_box(b"smhd", 0, 0, &[0; 4])
    };
    let dref = full_box(
        b"dref",
        0,
        0,
        &[&1u32.to_be_bytes()[..], &full_box(b"url ", 0, 1, &[])].concat(),
    );
    let dinf = boxed(b"dinf", &[&dref]);
    let entry = boxed(spec.entry, &[&[0; 6], &[0, 1], &[0xaa; 8]]);
    let stsd = full_box(b"stsd", 0, 0, &[&1u32.to_be_bytes()[..], &entry].concat());
    let empty = |kind: &[u8; 4]| full_box(kind, 0, 0, &[0; 4]);
    let stsz = full_box(b"stsz", 0, 0, &[0; 8]);
    let stbl = boxed(
        b"stbl",
        &[
            &stsd,
            &empty(b"stts"),
            &empty(b"stsc"),
            &empty(b"stco"),
            &stsz,
        ],
    );
    let minf = boxed(b"minf", &[&media_header, &dinf, &stbl]);
    let mdia = boxed(b"mdia", &[&mdhd, &hdlr, &minf]);
    let trak = match &edts {
        Some(edts) => boxed(b"trak", &[&tkhd, edts, &mdia]),
        None => boxed(b"trak", &[&tkhd, &mdia]),
    };
    let mut trex = Body::default();
    trex.u32(1).u32(1).u32(0).u32(0).u32(0);
    let mvex = boxed(b"mvex", &[&full_box(b"trex", 0, 0, &trex.0)]);
    boxed(b"moov", &[&mvhd, &mvex, &trak])
}
