use super::host::Memory;
use super::*;

fn inner(capacity: usize, reserved: usize) -> Inner {
    Inner {
        reserved,
        ..Inner::new(capacity)
    }
}

fn host(total_mib: u64, available_mib: u64, swap: Swap) -> Option<Reading> {
    Some(Reading {
        memory: Memory {
            total: total_mib * MIB,
            available: available_mib * MIB,
        },
        swap,
    })
}

fn tile_4k() -> Footprint {
    Footprint::decoding(None)
}

#[test]
fn an_unreserved_box_spends_its_whole_budget() {
    assert_eq!(inner(7, 0).effective(), 7);
}

#[test]
fn a_reservation_leaves_background_work_one_pass_at_a_time() {
    assert_eq!(inner(7, 1).effective(), 1);
}

#[test]
fn two_viewers_do_not_take_the_box_away_twice_over() {
    assert_eq!(inner(7, 2).effective(), 1);
}

#[test]
fn the_floor_never_hands_out_more_than_the_operator_allowed() {
    assert_eq!(inner(1, 1).effective(), 1);
}

#[test]
fn an_operator_asking_for_more_than_the_box_allows_gets_the_ceiling() {
    assert_eq!(capacity_from(4), 4);
    assert_eq!(capacity_from(99), 32);
}

#[test]
fn a_setting_of_zero_leaves_the_box_to_size_itself() {
    assert_eq!(capacity_from(0), auto_capacity());
    assert_eq!(capacity_from(-1), auto_capacity());
}

#[test]
fn a_pass_that_fits_beside_the_reserve_starts() {
    let gate = inner(3, 0);

    let verdict = gate.fits(tile_4k(), host(3776, 1024, Swap::Calm));

    assert_eq!(verdict, Ok(()));
}

#[test]
fn a_pass_that_would_eat_into_the_reserve_waits() {
    let gate = inner(3, 0);

    let verdict = gate.fits(tile_4k(), host(3776, 440, Swap::Calm));

    assert_eq!(
        verdict,
        Err(Hold::Short {
            need: tile_4k().bytes(),
            room: 184 * MIB,
        })
    );
}

#[test]
fn the_passes_already_running_count_against_the_room_left() {
    let mut gate = inner(3, 0);
    gate.in_use = 1;
    gate.committed = tile_4k().bytes();

    let verdict = gate.fits(tile_4k(), host(3776, 700, Swap::Calm));

    assert!(matches!(verdict, Err(Hold::Short { .. })));
}

#[test]
fn a_light_pass_still_starts_beside_a_heavy_one_on_a_small_box() {
    let mut gate = inner(3, 0);
    gate.in_use = 1;
    gate.committed = tile_4k().bytes();

    let verdict = gate.fits(Footprint::LIGHT, host(3776, 700, Swap::Calm));

    assert_eq!(verdict, Ok(()));
}

#[test]
fn a_host_swapping_memory_back_in_starts_nothing() {
    let gate = inner(3, 0);

    let verdict = gate.fits(Footprint::LIGHT, host(16_384, 8_192, Swap::Swapping(1000)));

    assert_eq!(verdict, Err(Hold::Swapping(1000)));
}

#[test]
fn a_host_whose_swap_rate_is_not_measured_yet_waits_for_a_sample() {
    let gate = inner(3, 0);

    let verdict = gate.fits(Footprint::LIGHT, host(16_384, 8_192, Swap::Unmeasured));

    assert_eq!(verdict, Err(Hold::Unmeasured));
}

#[test]
fn a_host_that_publishes_no_memory_figures_is_held_to_the_count_alone() {
    let gate = inner(3, 0);

    let verdict = gate.fits(tile_4k(), None);

    assert_eq!(verdict, Ok(()));
}
