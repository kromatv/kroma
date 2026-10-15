use super::*;

#[test]
fn nothing_asked_for_spawns_nothing() {
    let plan = Plan::for_duration(60.0);

    let landed = grab_tiles(
        "/films/one.mkv",
        Path::new("/nope"),
        &plan,
        &[],
        Decode::Keyframes,
        &|| false,
    );

    assert_eq!(landed.unwrap(), Vec::<u32>::new());
}

#[test]
fn a_tile_that_could_not_be_read_is_reported_with_its_cause() {
    let plan = Plan::for_duration(60.0);
    let scratch = kroma_testing::temp_dir("tile-none");

    let refused = grab_tiles(
        "/films/nothing-here.mkv",
        scratch.path(),
        &plan,
        &[0, 1],
        Decode::Keyframes,
        &|| false,
    );

    assert!(refused.is_err());
}

#[test]
fn a_decode_path_states_its_own_input_flags() {
    assert_eq!(Decode::Hardware.args(), ["-hwaccel", "auto"]);
    assert_eq!(Decode::Keyframes.args(), ["-skip_frame", "nokey"]);
}

#[test]
fn a_cell_is_named_by_its_position_so_the_montage_reads_them_in_order() {
    assert_eq!(name_of(0), "px_0000.png");
    assert_eq!(name_of(239), "px_0239.png");
    assert_eq!(name_of(0), TILE_PATTERN.replace("%04d", "0000"));
    assert_eq!(name_of(239), TILE_PATTERN.replace("%04d", "0239"));
}

#[test]
fn every_tile_asked_for_lands_and_is_reported_in_order() {
    let scratch = kroma_testing::temp_dir("tile-grab");
    let input = crate::test_support::clip(scratch.path());
    let plan = Plan::for_duration(5.0);

    let landed = grab_tiles(
        input.to_str().unwrap(),
        scratch.path(),
        &plan,
        &plan.every(),
        Decode::Keyframes,
        &|| false,
    );

    assert_eq!(landed.unwrap(), plan.every());
    assert!(scratch.path().join(name_of(0)).exists());
}

#[test]
fn a_pass_cancelled_before_it_starts_grabs_nothing_and_says_so() {
    let scratch = kroma_testing::temp_dir("tile-cancel");
    let input = crate::test_support::clip(scratch.path());
    let plan = Plan::for_duration(5.0);

    let refused = grab_tiles(
        input.to_str().unwrap(),
        scratch.path(),
        &plan,
        &plan.every(),
        Decode::Keyframes,
        &|| true,
    );

    assert_eq!(refused, Err("no tiles produced".to_string()));
}

#[test]
fn a_sheet_with_no_gap_in_it_is_left_exactly_as_it_was() {
    let scratch = kroma_testing::temp_dir("tile-nogap");
    for index in 0..3 {
        std::fs::write(scratch.path().join(name_of(index)), b"tile").unwrap();
    }

    fill_gaps(scratch.path(), 3);

    for index in 0..3 {
        assert_eq!(
            std::fs::read(scratch.path().join(name_of(index))).unwrap(),
            b"tile"
        );
    }
}

#[test]
fn a_seek_that_produced_nothing_is_backfilled_so_the_cells_after_it_hold() {
    let scratch = kroma_testing::temp_dir("tile-gap");
    std::fs::write(scratch.path().join(name_of(1)), b"tile").unwrap();

    fill_gaps(scratch.path(), 3);

    assert!(scratch.path().join(name_of(0)).exists());
    assert!(scratch.path().join(name_of(2)).exists());
    assert_eq!(
        std::fs::read(scratch.path().join(name_of(1))).unwrap(),
        b"tile"
    );
}

#[test]
fn the_worker_count_stays_inside_the_band_whatever_the_box_reports() {
    let count = workers();

    assert!((2..=MAX_WORKERS).contains(&count));
}

#[test]
fn the_decode_path_is_measured_once_and_the_answer_is_kept() {
    let scratch = kroma_testing::temp_dir("tile-probe");
    let input = crate::test_support::clip(scratch.path());
    let path = input.to_str().unwrap();

    let first = probe(path, 5.0);

    assert_eq!(probe(path, 5.0), first);
}

#[test]
fn a_box_whose_software_decode_fails_is_never_measured_against_hardware() {
    assert_eq!(measure("/nowhere/absent.mkv", 5.0), Decode::Keyframes);
}
