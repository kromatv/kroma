use super::*;

fn inputs() -> Inputs {
    Inputs {
        catalog: 0,
        activity: HomeActivity {
            progress: (0, None),
            watched: (0, None),
            plays: (0, None),
            taste: None,
            vectors: None,
        },
        day: 0,
        part_of_day: PartOfDay::Morning,
        show_recent: true,
        played_percent: 90,
    }
}

#[test]
fn an_entry_is_served_until_it_is_ten_minutes_old() {
    let shelf: Shelf<u32> = Shelf::default();
    let key = Key::new("ann", "en");
    shelf.keep(key.clone(), inputs(), 0, 7);

    let fresh = shelf.recall(&key, &inputs(), FRESH_FOR_MS - 1);
    let expired = shelf.recall(&key, &inputs(), FRESH_FOR_MS);

    assert_eq!(fresh, Some(7));
    assert_eq!(expired, None);
}

#[test]
fn an_entry_built_from_other_inputs_is_not_served() {
    let shelf: Shelf<u32> = Shelf::default();
    let key = Key::new("ann", "en");
    shelf.keep(key.clone(), inputs(), 0, 7);
    let moved = Inputs {
        catalog: 1,
        ..inputs()
    };

    let recalled = shelf.recall(&key, &moved, 1);

    assert_eq!(recalled, None);
}

#[test]
fn an_expired_entry_is_dropped_when_another_is_kept() {
    let shelf: Shelf<u32> = Shelf::default();
    shelf.keep(Key::new("ann", "en"), inputs(), 0, 7);

    shelf.keep(Key::new("bob", "en"), inputs(), FRESH_FOR_MS, 8);

    let held = shelf.held.lock().unwrap();
    assert_eq!(held.len(), 1);
    assert!(held.contains_key(&Key::new("bob", "en")));
}

#[test]
fn the_shared_candidates_are_read_again_after_an_hour() {
    let slot: Slot<u32> = Slot::default();
    slot.keep(3, 0, 7);

    let fresh = slot.recall(3, CANDIDATES_FRESH_FOR_MS - 1);
    let expired = slot.recall(3, CANDIDATES_FRESH_FOR_MS);
    let moved = slot.recall(4, 1);

    assert_eq!(fresh, Some(7));
    assert_eq!(expired, None);
    assert_eq!(moved, None);
}
