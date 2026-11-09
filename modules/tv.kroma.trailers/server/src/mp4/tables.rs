use super::boxes::{boxed, full_box, Body};
use super::layout::Chunk;
use super::read::Track;

fn runs<T: PartialEq + Copy>(values: impl Iterator<Item = T>) -> Vec<(u32, T)> {
    let mut out: Vec<(u32, T)> = Vec::new();
    for value in values {
        match out.last_mut() {
            Some((count, last)) if *last == value => *count += 1,
            _ => out.push((1, value)),
        }
    }
    out
}

pub(super) fn stbl(track: &Track, chunks: &[&Chunk], offsets: &[u64], wide: bool) -> Vec<u8> {
    let samples = &track.samples;
    let mut parts = vec![track.stsd.clone()];

    let durations = runs(samples.iter().map(|s| s.duration));
    let mut stts = Body::default();
    stts.u32(durations.len() as u32);
    for (count, delta) in durations {
        stts.u32(count).u32(delta);
    }
    parts.push(full_box(b"stts", 0, 0, &stts.0));

    if samples.iter().any(|s| s.cto != 0) {
        let signed = samples.iter().any(|s| s.cto < 0);
        let offsets = runs(samples.iter().map(|s| s.cto));
        let mut ctts = Body::default();
        ctts.u32(offsets.len() as u32);
        for (count, cto) in offsets {
            ctts.u32(count).i32(cto);
        }
        parts.push(full_box(b"ctts", u8::from(signed), 0, &ctts.0));
    }

    if samples.iter().any(|s| !s.sync) {
        let mut stss = Body::default();
        let sync: Vec<u32> = samples
            .iter()
            .enumerate()
            .filter(|(_, s)| s.sync)
            .map(|(i, _)| i as u32 + 1)
            .collect();
        stss.u32(sync.len() as u32);
        for number in sync {
            stss.u32(number);
        }
        parts.push(full_box(b"stss", 0, 0, &stss.0));
    }

    let per_chunk = runs(chunks.iter().map(|c| c.count as u32));
    let mut stsc = Body::default();
    let mut first_chunk = 1u32;
    let mut entries = Body::default();
    let mut entry_count = 0u32;
    for (count, samples_per_chunk) in per_chunk {
        entries.u32(first_chunk).u32(samples_per_chunk).u32(1);
        entry_count += 1;
        first_chunk += count;
    }
    stsc.u32(entry_count).bytes(&entries.0);
    parts.push(full_box(b"stsc", 0, 0, &stsc.0));

    let mut stsz = Body::default();
    let uniform = samples
        .first()
        .map(|s| s.size)
        .filter(|size| samples.iter().all(|s| s.size == *size));
    match uniform {
        Some(size) => {
            stsz.u32(size).u32(samples.len() as u32);
        }
        None => {
            stsz.u32(0).u32(samples.len() as u32);
            for sample in samples {
                stsz.u32(sample.size);
            }
        }
    }
    parts.push(full_box(b"stsz", 0, 0, &stsz.0));

    let mut stco = Body::default();
    stco.u32(offsets.len() as u32);
    for offset in offsets {
        if wide {
            stco.u64(*offset);
        } else {
            stco.u32(*offset as u32);
        }
    }
    parts.push(full_box(
        if wide { b"co64" } else { b"stco" },
        0,
        0,
        &stco.0,
    ));

    let refs: Vec<&[u8]> = parts.iter().map(Vec::as_slice).collect();
    boxed(b"stbl", &refs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_folds_repeated_values() {
        let folded = runs([5, 5, 7, 5].into_iter());

        assert_eq!(folded, vec![(2, 5), (1, 7), (1, 5)]);
    }
}
