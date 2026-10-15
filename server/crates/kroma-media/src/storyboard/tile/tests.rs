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
