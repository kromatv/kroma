use super::*;

fn ended(start: Start) -> Setup {
    let mut setup = Setup::led_by("owner");
    setup.advance(Step::Media, start);
    setup.ended = true;
    setup
}

#[test]
fn a_new_setup_waits_on_the_owner_account_it_was_made_with() {
    let setup = Setup::led_by("owner");

    let view = setup.view();

    assert_eq!(view.step, Step::Owner);
    assert!(!view.ended);
}

#[test]
fn only_the_owner_it_was_made_for_is_led_by_it() {
    let setup = Setup::led_by("owner");

    let led = (setup.is_led_by("owner"), setup.is_led_by("someone"));

    assert_eq!(led, (true, false));
}

#[test]
fn going_back_keeps_the_furthest_step() {
    let mut setup = Setup::led_by("owner");
    setup.advance(Step::People, Start::Fresh);

    setup.advance(Step::Media, Start::Fresh);

    assert_eq!((setup.step, setup.reached), (Step::Media, Step::People));
}

#[test]
fn a_running_setup_has_no_checklist() {
    let mut setup = ended(Start::Fresh);
    setup.ended = false;

    let lines = setup.checklist();

    assert!(lines.is_empty());
}

#[test]
fn a_fresh_setup_has_no_import_line() {
    let setup = ended(Start::Fresh);

    let lines = setup.checklist();

    assert_eq!(
        lines,
        [Step::Media, Step::Modules, Step::People, Step::Privacy]
    );
}

#[test]
fn a_setup_that_brought_a_server_over_opens_on_the_import_line() {
    let setup = ended(Start::Bring);

    let lines = setup.checklist();

    assert_eq!(lines.first(), Some(&Step::Import));
}

#[test]
fn each_fact_the_server_holds_takes_its_line_away() {
    let mut setup = ended(Start::Bring);
    let facts = Facts {
        imported: true,
        source: true,
        module: true,
        people: true,
    };

    setup.observe(facts);

    assert_eq!(setup.checklist(), [Step::Privacy]);
}

#[test]
fn observing_a_step_already_done_changes_nothing() {
    let mut setup = ended(Start::Fresh);
    let facts = Facts {
        source: true,
        ..Facts::default()
    };
    setup.observe(facts);

    let changed = setup.observe(facts);

    assert!(!changed);
}

#[test]
fn a_step_seen_done_stays_done_when_its_result_goes() {
    let mut setup = ended(Start::Fresh);
    setup.observe(Facts {
        source: true,
        ..Facts::default()
    });

    setup.observe(Facts::default());

    assert!(!setup.checklist().contains(&Step::Media));
}

#[test]
fn a_dismissed_line_leaves_the_checklist() {
    let mut setup = ended(Start::Fresh);

    setup.dismissed.insert(Step::People);

    assert!(!setup.checklist().contains(&Step::People));
}

#[test]
fn only_the_modules_and_statistics_steps_are_confirmed_by_the_owner() {
    let confirmed: Vec<Step> = LINES
        .into_iter()
        .filter(|step| step.confirmed_by_the_owner())
        .collect();

    assert_eq!(confirmed, [Step::Modules, Step::Privacy]);
}

#[test]
fn a_step_is_written_as_the_web_names_it() {
    let written = serde_json::to_value([Step::Privacy, Step::Done]).unwrap();

    assert_eq!(written, serde_json::json!(["privacy", "done"]));
}
