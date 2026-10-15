use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use kroma_module_sdk::media::storyboard::{
    encode_jpeg, fill_gaps, grab_tiles, montage, Decode, Plan,
};
use kroma_module_sdk::media::tmp_file::{finalize, unique_tmp};

use crate::DownloadManager;

use super::arrived::Arrived;
use super::file::WatchedFile;
use super::probes::offered;
use super::source::Refusal;
use super::Watch;

const REACH_MS: u64 = 15_000;
const REDRAW_AFTER: Duration = Duration::from_secs(10);
const SHEET: &str = "sheet.jpg";

pub struct Drawn {
    pub plan: Plan,
    pub ready: String,
    pub complete: bool,
    pub version: u64,
    pub duration_ms: u64,
}

struct Board {
    plan: Plan,
    drawn: Vec<bool>,
    version: u64,
    published: bool,
    laid_out: Option<Instant>,
    drawing: bool,
}

impl Board {
    fn new(plan: Plan) -> Self {
        Self {
            drawn: vec![false; plan.count as usize],
            plan,
            version: 0,
            published: false,
            laid_out: None,
            drawing: false,
        }
    }

    fn missing(&self, wanted: &[u32]) -> Vec<u32> {
        wanted
            .iter()
            .copied()
            .filter(|at| !self.drawn[*at as usize])
            .collect()
    }

    fn due(&self, missing: &[u32]) -> bool {
        let fresh = self.laid_out.is_some_and(|at| at.elapsed() < REDRAW_AFTER);
        !self.drawing && !fresh && !missing.is_empty()
    }

    fn ready(&self) -> String {
        self.drawn
            .iter()
            .map(|held| if *held { '1' } else { '0' })
            .collect()
    }
}

#[derive(Default)]
pub struct Boards(Mutex<HashMap<WatchedFile, Board>>);

impl Boards {
    pub(super) fn downloads(&self) -> HashSet<String> {
        self.0
            .lock()
            .unwrap()
            .keys()
            .map(|watched| watched.download.clone())
            .collect()
    }

    pub(super) fn forget(&self, downloads: &HashSet<String>) {
        self.0
            .lock()
            .unwrap()
            .retain(|watched, _| !downloads.contains(&watched.download));
    }
}

impl Watch {
    /// The sheet for `watched`, and `None` while no tile has been drawn yet.
    ///
    /// Only the tiles whose own region is on disk are ever asked for, so a pass
    /// cannot send the piece picker after bytes the viewer has not asked for.
    pub async fn storyboard(
        self: &Arc<Self>,
        manager: &Arc<DownloadManager>,
        watched: &WatchedFile,
    ) -> Result<Option<Drawn>, Refusal> {
        offered(manager, watched).await?;
        let probed = self.probe(manager, watched).await?;
        if probed.video.is_none() {
            return Err(Refusal::Unknown(
                "this file holds no picture to preview".to_string(),
            ));
        }
        let duration_ms = probed.duration_ms.filter(|ms| *ms > 0).ok_or_else(|| {
            Refusal::Unknown("this file states no length to sample over".to_string())
        })?;
        let plan = Plan::for_duration(duration_ms as f64 / 1000.0);
        let (layout, input) = self.on_disk(manager, watched).await?;
        let wanted = on_hand(&Arrived::new(&layout, duration_ms), &plan);
        self.lay_out(watched, plan, input, &wanted);
        Ok(self.sheet_of(watched, duration_ms))
    }

    pub async fn sheet(&self, watched: &WatchedFile) -> Option<Vec<u8>> {
        tokio::fs::read(self.scratch_for(watched).join(SHEET))
            .await
            .ok()
    }

    fn sheet_of(&self, watched: &WatchedFile, duration_ms: u64) -> Option<Drawn> {
        let boards = self.boards.0.lock().unwrap();
        let board = boards.get(watched).filter(|board| board.published)?;
        Some(Drawn {
            plan: board.plan,
            ready: board.ready(),
            complete: board.drawn.iter().all(|held| *held),
            version: board.version,
            duration_ms,
        })
    }

    fn lay_out(
        self: &Arc<Self>,
        watched: &WatchedFile,
        plan: Plan,
        input: PathBuf,
        wanted: &[u32],
    ) {
        let missing = {
            let mut boards = self.boards.0.lock().unwrap();
            let board = boards
                .entry(watched.clone())
                .or_insert_with(|| Board::new(plan));
            let missing = board.missing(wanted);
            if !board.due(&missing) {
                return;
            }
            board.drawing = true;
            missing
        };
        let (engine, watched) = (Arc::clone(self), watched.clone());
        let dir = self.scratch_for(&watched);
        let (kept_tiles, sheet) = (dir.join("tiles"), dir.join(SHEET));
        tokio::task::spawn_blocking(move || {
            let landed = grab_and_republish(&input, &kept_tiles, &sheet, &plan, &missing);
            engine.laid_out(&watched, &landed);
        });
    }

    fn laid_out(&self, watched: &WatchedFile, landed: &[u32]) {
        let mut boards = self.boards.0.lock().unwrap();
        let Some(board) = boards.get_mut(watched) else {
            return;
        };
        board.drawing = false;
        board.laid_out = Some(Instant::now());
        if landed.is_empty() {
            return;
        }
        for at in landed {
            board.drawn[*at as usize] = true;
        }
        board.published = true;
        board.version += 1;
    }
}

fn on_hand(arrived: &Arrived, plan: &Plan) -> Vec<u32> {
    (0..plan.count)
        .filter(|at| arrived.holds(u64::from(plan.at(*at)) * 1000, REACH_MS))
        .collect()
}

fn grab_and_republish(
    input: &Path,
    kept_tiles: &Path,
    sheet: &Path,
    plan: &Plan,
    missing: &[u32],
) -> Vec<u32> {
    if std::fs::create_dir_all(kept_tiles).is_err() {
        return Vec::new();
    }
    let input = input.to_string_lossy().into_owned();
    let Ok(landed) = grab_tiles(&input, kept_tiles, plan, missing, Decode::Frames, &|| false)
    else {
        return Vec::new();
    };
    fill_gaps(kept_tiles, plan.count);
    let mosaic = kept_tiles.join("mosaic.png");
    let tmp = unique_tmp(sheet);
    let laid_out = montage(kept_tiles, plan, &mosaic)
        .and_then(|()| encode_jpeg(&mosaic, &tmp))
        .is_ok();
    match laid_out && finalize(&tmp, sheet) {
        true => landed,
        false => {
            let _ = std::fs::remove_file(&tmp);
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::engine::PieceLayout;

    fn board(drawn: &[bool]) -> Board {
        Board {
            drawn: drawn.to_vec(),
            ..Board::new(Plan::for_duration(drawn.len() as f64 * 2.0))
        }
    }

    #[test]
    fn a_board_nothing_has_been_laid_out_on_draws_as_soon_as_a_tile_is_on_hand() {
        let waiting = board(&[false, false, false]);

        assert!(waiting.due(&waiting.missing(&[0])));
        assert!(!waiting.due(&waiting.missing(&[])));
    }

    #[test]
    fn a_tile_already_drawn_is_never_asked_for_again() {
        let done = board(&[true, true, false]);

        assert_eq!(done.missing(&[0, 1, 2]), vec![2]);
        assert!(!done.due(&done.missing(&[0, 1])));
    }

    #[test]
    fn a_sheet_just_laid_out_waits_before_it_is_laid_out_again() {
        let mut fresh = board(&[true, false]);
        fresh.laid_out = Some(Instant::now());

        assert!(!fresh.due(&[1]));

        fresh.laid_out = Some(Instant::now() - REDRAW_AFTER);
        assert!(fresh.due(&[1]));
    }

    #[test]
    fn a_pass_already_running_is_never_joined_by_a_second() {
        let mut running = board(&[false, false]);
        running.drawing = true;

        assert!(!running.due(&[0, 1]));
    }

    #[test]
    fn the_ready_string_says_one_character_per_cell_of_the_grid() {
        let half = board(&[true, false, true]);

        assert_eq!(half.ready(), "101");
    }

    #[test]
    fn the_tiles_asked_for_stop_where_the_download_does() {
        let layout = PieceLayout {
            have: vec![true, true, true, false, false, false],
            first_piece: 0,
            piece_len: 1_000,
            file: 0..6_000,
        };
        let plan = Plan::for_duration(600.0);
        let arrived = Arrived::new(&layout, 600_000);

        let wanted = on_hand(&arrived, &plan);

        assert_eq!(wanted.first(), Some(&0));
        assert!(u64::from(plan.at(*wanted.last().unwrap())) * 1000 < 300_000);
        assert!(wanted.len() < plan.count as usize);
    }
}
