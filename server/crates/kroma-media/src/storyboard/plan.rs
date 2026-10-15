// True 16:9, both dimensions even so 4:2:0 chroma never coerces the crop to an
// odd size, which would drift a client's `background-position`.
pub const TILE_W: u32 = 160;
pub const TILE_H: u32 = 90;

const MAX_TILES: u32 = 240;
const MIN_INTERVAL: u32 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Plan {
    pub interval: u32,
    pub cols: u32,
    pub rows: u32,
    pub count: u32,
}

impl Plan {
    pub fn for_duration(dur_s: f64) -> Self {
        let interval = ((dur_s / f64::from(MAX_TILES)).ceil() as u32).max(MIN_INTERVAL);
        let count = ((dur_s as u32 / interval) + 1).clamp(1, MAX_TILES);
        let cols = (f64::from(count).sqrt().ceil() as u32).max(1);
        let rows = count.div_ceil(cols).max(1);
        Self {
            interval,
            cols,
            rows,
            count,
        }
    }

    /// The second tile `index` is sampled at.
    pub fn at(&self, index: u32) -> u32 {
        index * self.interval
    }

    pub fn every(&self) -> Vec<u32> {
        (0..self.count).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_long_film_still_fits_one_sheet() {
        let plan = Plan::for_duration(7200.0);

        assert!(plan.interval >= MIN_INTERVAL);
        assert!(plan.count <= MAX_TILES);
        assert!(plan.cols * plan.rows >= plan.count);
    }

    #[test]
    fn a_short_clip_is_sampled_no_finer_than_the_floor() {
        let plan = Plan::for_duration(60.0);

        assert_eq!(plan.interval, MIN_INTERVAL);
        assert!(plan.count < MAX_TILES);
        assert!(plan.cols * plan.rows >= plan.count);
    }

    #[test]
    fn the_last_tile_of_a_plan_lands_inside_the_runtime() {
        let plan = Plan::for_duration(658.0);

        assert_eq!(plan.at(0), 0);
        assert!(plan.at(plan.count - 1) <= 658);
        assert_eq!(plan.every().len() as u32, plan.count);
    }
}
