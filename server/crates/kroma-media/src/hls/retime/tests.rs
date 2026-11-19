use super::testing::{decode_times, full, index_times, init, mp4, segment, traf, AUDIO, VIDEO};
use super::*;

const VIDEO_AT_60: u64 = 960_944;
const AUDIO_AT_60: u64 = 2_880_512;

fn sixty_seconds_in() -> Vec<u8> {
    segment(&[(VIDEO, VIDEO_AT_60), (AUDIO, AUDIO_AT_60)])
}

fn a_cut_at_sixty_seconds() -> Shift {
    shift(&init(&[VIDEO, AUDIO]), &sixty_seconds_in()).expect("a shift")
}

#[test]
fn every_track_moves_back_by_the_time_the_earliest_one_began_at() {
    let shift = a_cut_at_sixty_seconds();

    let served = retimed(sixty_seconds_in(), Some(&shift));

    assert_eq!(decode_times(&served), vec![(1, 774), (2, 0)]);
}

#[test]
fn a_later_segment_moves_back_by_the_same_time_as_the_first() {
    let shift = a_cut_at_sixty_seconds();
    let later = segment(&[
        (VIDEO, VIDEO_AT_60 + 96_096),
        (AUDIO, AUDIO_AT_60 + 288_000),
    ]);

    let served = retimed(later, Some(&shift));

    assert_eq!(decode_times(&served), vec![(1, 96_870), (2, 288_000)]);
}

#[test]
fn the_index_a_segment_opens_with_moves_with_its_fragments() {
    let shift = a_cut_at_sixty_seconds();

    let served = retimed(sixty_seconds_in(), Some(&shift));

    assert_eq!(index_times(&served), vec![(1, 774), (2, 0)]);
}

#[test]
fn the_shift_reads_as_the_seconds_the_earliest_track_began_at() {
    let shift = a_cut_at_sixty_seconds();

    let seconds = shift.seconds();

    assert_eq!(seconds, 2_880_512.0 / 48_000.0);
}

#[test]
fn a_32_bit_decode_time_moves_back_like_a_64_bit_one() {
    let shift = a_cut_at_sixty_seconds();
    let narrow = traf(VIDEO.0, &full(b"tfdt", 0, &1_000_000u32.to_be_bytes()));
    let fragment = mp4(b"moof", &narrow);

    let served = retimed(fragment, Some(&shift));

    assert_eq!(decode_times(&served), vec![(1, 39_830)]);
}

#[test]
fn a_time_earlier_than_the_shift_stops_at_zero() {
    let shift = a_cut_at_sixty_seconds();
    let earlier = segment(&[(VIDEO, 16_000), (AUDIO, 48_000)]);

    let served = retimed(earlier, Some(&shift));

    assert_eq!(decode_times(&served), vec![(1, 0), (2, 0)]);
}

#[test]
fn a_segment_served_without_a_shift_is_served_as_written() {
    let written = sixty_seconds_in();

    let served = retimed(written.clone(), None);

    assert_eq!(served, written);
}

#[test]
fn a_segment_carrying_a_track_the_init_never_declared_has_no_shift() {
    let init = init(&[VIDEO]);

    let shift = shift(&init, &sixty_seconds_in());

    assert_eq!(shift, None);
}

#[test]
fn bytes_that_are_not_a_segment_have_no_shift() {
    let init = init(&[VIDEO, AUDIO]);

    let shift = shift(&init, b"partial");

    assert_eq!(shift, None);
}

#[test]
fn a_segment_cut_short_inside_its_fragment_has_no_shift() {
    let init = init(&[VIDEO, AUDIO]);
    let written = sixty_seconds_in();
    let moof_ends = written.len() - 40;

    let shift = shift(&init, &written[..moof_ends - 1]);

    assert_eq!(shift, None);
}

#[test]
fn an_init_written_with_64_bit_headers_still_names_its_timescales() {
    let tkhd = full(
        b"tkhd",
        1,
        &[[0; 16].as_slice(), &7u32.to_be_bytes(), &[0; 4]].concat(),
    );
    let mdhd = full(
        b"mdhd",
        1,
        &[[0; 16].as_slice(), &90_000u32.to_be_bytes(), &[0; 12]].concat(),
    );
    let trak = mp4(b"trak", &[tkhd, mp4(b"mdia", &mdhd)].concat());

    let timescales = timescales(&mp4(b"moov", &trak));

    assert_eq!(timescales, vec![(7, 90_000)]);
}
