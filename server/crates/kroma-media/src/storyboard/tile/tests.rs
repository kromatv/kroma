use super::*;

use std::path::PathBuf;

fn clip_with_a_hole(dir: &Path) -> Option<PathBuf> {
    let clip = dir.join("clip.mkv");
    let made = Command::new("ffmpeg")
        .args(["-v", "error", "-y", "-f", "lavfi", "-i"])
        .arg("testsrc2=size=320x180:rate=10:duration=60")
        .args(["-c:v", "libx264", "-preset", "ultrafast", "-g", "10"])
        .args(["-pix_fmt", "yuv420p"])
        .arg(&clip)
        .status()
        .ok()?;
    if !made.success() {
        return None;
    }
    let mut bytes = std::fs::read(&clip).ok()?;
    let hole = bytes.len() / 3..bytes.len() * 2 / 3;
    bytes[hole].fill(0);
    std::fs::write(&clip, &bytes).ok()?;
    Some(clip)
}

#[test]
fn a_cell_whose_second_has_not_arrived_is_no_tile_rather_than_a_later_frame() {
    let dir = kroma_testing::temp_dir("tile-hole");
    let Some(clip) = clip_with_a_hole(dir.path()) else {
        return;
    };
    let plan = Plan::for_duration(60.0);
    let (arrived, in_the_hole) = (2, 15);

    let landed = grab_tiles(
        &clip.to_string_lossy(),
        dir.path(),
        &plan,
        &[arrived, in_the_hole],
        Decode::Frames,
        &|| false,
    )
    .unwrap_or_default();

    assert!(landed.contains(&arrived), "{landed:?}");
    assert!(!landed.contains(&in_the_hole), "{landed:?}");
}

#[test]
fn nothing_asked_for_spawns_nothing() {
    let plan = Plan::for_duration(60.0);

    let landed = grab_tiles(
        "/films/one.mkv",
        Path::new("/nope"),
        &plan,
        &[],
        Decode::Frames,
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
        Decode::Frames,
        &|| false,
    );

    assert!(refused.is_err());
}

#[test]
fn a_decode_path_states_its_own_input_flags() {
    assert_eq!(Decode::Hardware.args(), ["-hwaccel", "auto"]);
    assert_eq!(Decode::Keyframes.args(), ["-skip_frame", "nokey"]);
    assert!(Decode::Frames.args().is_empty());
}

#[test]
fn a_cell_is_named_by_its_position_so_the_montage_reads_them_in_order() {
    assert_eq!(name_of(0), "px_0000.png");
    assert_eq!(name_of(239), "px_0239.png");
    assert_eq!(name_of(0), TILE_PATTERN.replace("%04d", "0000"));
    assert_eq!(name_of(239), TILE_PATTERN.replace("%04d", "0239"));
}
