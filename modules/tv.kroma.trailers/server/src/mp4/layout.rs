use super::read::Track;

const CHUNK_SECONDS: u64 = 1;
const CHUNK_BYTES: u64 = 2 * 1024 * 1024;

pub(crate) struct Chunk {
    pub(crate) track: usize,
    pub(crate) count: usize,
    pub(crate) input: u64,
    pub(crate) bytes: u64,
    start: u64,
}

pub(crate) fn plan(tracks: &[Track]) -> Vec<Chunk> {
    let mut chunks: Vec<Chunk> = tracks
        .iter()
        .enumerate()
        .flat_map(|(index, track)| chunk_track(index, track))
        .collect();
    chunks.sort_by(|a, b| {
        let at =
            |c: &Chunk| u128::from(c.start) * 1_000_000 / u128::from(tracks[c.track].timescale);
        at(a).cmp(&at(b)).then(a.track.cmp(&b.track))
    });
    chunks
}

fn chunk_track(index: usize, track: &Track) -> Vec<Chunk> {
    let limit = u64::from(track.timescale) * CHUNK_SECONDS;
    let mut out: Vec<Chunk> = Vec::new();
    let mut dts = 0u64;
    let mut span = 0u64;
    for sample in &track.samples {
        let joins = out.last().is_some_and(|last| {
            last.input + last.bytes == sample.offset && span < limit && last.bytes < CHUNK_BYTES
        });
        match out.last_mut() {
            Some(last) if joins => {
                last.count += 1;
                last.bytes += u64::from(sample.size);
            }
            _ => {
                span = 0;
                out.push(Chunk {
                    track: index,
                    count: 1,
                    input: sample.offset,
                    bytes: u64::from(sample.size),
                    start: dts,
                });
            }
        }
        span += u64::from(sample.duration);
        dts += u64::from(sample.duration);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::mp4::read::Sample;

    fn track(timescale: u32, samples: &[(u64, u32, u32)]) -> Track {
        Track {
            handler: *b"vide",
            timescale,
            movie_timescale: timescale,
            language: 0,
            width: 0,
            height: 0,
            hdlr: Vec::new(),
            media_header: Vec::new(),
            dinf: Vec::new(),
            stsd: Vec::new(),
            edits: Vec::new(),
            start: 0,
            samples: samples
                .iter()
                .map(|(offset, size, duration)| Sample {
                    offset: *offset,
                    size: *size,
                    duration: *duration,
                    cto: 0,
                    sync: true,
                })
                .collect(),
        }
    }

    #[test]
    fn samples_contiguous_in_the_input_share_a_chunk() {
        let video = track(1000, &[(100, 10, 100), (110, 10, 100), (500, 10, 100)]);

        let chunks = plan(&[video]);

        let counts: Vec<usize> = chunks.iter().map(|c| c.count).collect();
        assert_eq!(counts, vec![2, 1]);
    }

    #[test]
    fn a_chunk_holds_at_most_a_second() {
        let video = track(1000, &[(0, 1, 600), (1, 1, 600), (2, 1, 600)]);

        let chunks = plan(&[video]);

        let counts: Vec<usize> = chunks.iter().map(|c| c.count).collect();
        assert_eq!(counts, vec![2, 1]);
    }

    #[test]
    fn chunks_of_both_tracks_interleave_by_time() {
        let video = track(1000, &[(0, 1, 1000), (900, 1, 1000)]);
        let audio = track(48000, &[(0, 1, 48000), (900, 1, 48000)]);

        let chunks = plan(&[video, audio]);

        let order: Vec<(usize, u64)> = chunks.iter().map(|c| (c.track, c.input)).collect();
        assert_eq!(order, vec![(0, 0), (1, 0), (0, 900), (1, 900)]);
    }
}
