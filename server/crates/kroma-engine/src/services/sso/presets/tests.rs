use super::*;

const SVG: &str = "<svg viewBox=\"0 0 1 1\"><path d=\"M0 0\"/></svg>";

fn manifest(extra: &str) -> String {
    format!(
        "{{\"name\":\"Home\",\"issuer\":\"https://id.example.com\",\
         \"docs\":\"https://id.example.com/docs\",\"sources\":{{\"mark\":\"drawn here\"}}{extra}}}"
    )
}

fn folder(id: &'static str, manifest: String, marks: &[&'static str]) -> Vec<(&'static str, &'static str, &'static str)> {
    let manifest: &'static str = Box::leak(manifest.into_boxed_str());
    let mut files = vec![(id, "mark.svg", SVG), (id, MANIFEST, manifest)];
    files.extend(marks.iter().map(|name| (id, *name, SVG)));
    files
}

fn problem_of(id: &'static str, manifest: String) -> String {
    let (catalog, problems) = read(&folder(id, manifest, &[]));

    assert!(catalog.presets.is_empty());
    problems.join("\n")
}

#[test]
fn every_preset_in_the_tree_reads_cleanly() {
    let (catalog, problems) = read(files::PRESET_FILES);

    assert_eq!(problems, Vec::<String>::new());
    assert!(catalog.presets.len() >= 19);
}

#[test]
fn every_preset_draws_marks_the_catalog_holds() {
    for preset in presets() {
        assert!(mark(&preset.mark).is_some(), "{}", preset.id);
        for look in preset.brand.iter().flat_map(|brand| [&brand.dark, &brand.light]) {
            assert!(mark(&look.mark).is_some(), "{}", preset.id);
        }
    }
}

#[test]
fn the_presets_come_sorted_by_name_whatever_their_case() {
    let names: Vec<String> = presets().iter().map(|p| p.name.to_lowercase()).collect();
    let mut sorted = names.clone();
    sorted.sort();

    assert_eq!(names, sorted);
}

#[test]
fn google_and_microsoft_are_painted_as_their_guidelines_say() {
    let google = preset("google").unwrap().brand.as_ref().unwrap();
    let microsoft = preset("entra").unwrap().brand.as_ref().unwrap();
    let paint = |look: &Look| (look.fill.clone(), look.stroke.clone(), look.ink.clone());
    let painted = |fill: &str, stroke: Option<&str>, ink: &str| {
        (fill.to_string(), stroke.map(str::to_string), ink.to_string())
    };

    assert_eq!(paint(&google.dark), painted("#131314", Some("#8e918f"), "#e3e3e3"));
    assert_eq!(paint(&google.light), painted("#ffffff", Some("#747775"), "#1f1f1f"));
    assert_eq!(paint(&microsoft.dark), painted("#2f2f2f", None, "#ffffff"));
    assert_eq!(paint(&microsoft.light), painted("#ffffff", Some("#8c8c8c"), "#5e5e5e"));
    assert_eq!(preset("entra").unwrap().label, "Microsoft");
}

#[test]
fn a_bare_manifest_takes_the_defaults() {
    let (catalog, problems) = read(&folder("home", manifest(""), &[]));

    assert!(problems.is_empty());
    let home = &catalog.presets[0];
    assert_eq!((home.label.as_str(), home.icon.as_str()), ("Home", "key"));
    assert_eq!(home.group_claim, "groups");
    assert_eq!(home.mark, "home/mark");
    assert!(home.brand.is_none() && home.console.is_none() && home.scopes.is_empty());
    assert_eq!(catalog.marks.len(), 1);
}

#[test]
fn one_look_paints_both_grounds_and_two_paint_one_each() {
    let same = r##","brand":{"fill":"#102030","ink":"#ffffff","mark":"white.svg"}"##;
    let both = r##","brand":{"dark":{"fill":"#000000","ink":"#ffffff","mark":"white.svg"},"light":{"fill":"#ffffff","stroke":"#cccccc","ink":"#000000","mark":"mark.svg"}}"##;

    let (one, _) = read(&folder("home", manifest(same), &["white.svg"]));
    let (two, _) = read(&folder("home", manifest(both), &["white.svg"]));

    let one = one.presets[0].brand.clone().unwrap();
    let two = two.presets[0].brand.clone().unwrap();
    assert_eq!(one.dark, one.light);
    assert_eq!(one.dark.mark, "home/white");
    assert_eq!(two.light.stroke.as_deref(), Some("#cccccc"));
    assert_eq!(two.light.mark, "home/mark");
}

#[test]
fn a_folder_that_does_not_make_a_preset_says_why() {
    let typo = manifest(r#","isuer":"x""#);
    let shouting = manifest(r##","brand":{"fill":"#FFAA00","ink":"#ffffff","mark":"mark.svg"}"##);
    let missing = manifest(r##","brand":{"fill":"#ffaa00","ink":"#ffffff","mark":"white.svg"}"##);
    let plain = manifest("").replace("https://id.example.com/docs", "http://id.example.com/docs");

    assert!(problem_of("home", typo).contains("does not read"));
    assert!(problem_of("home", shouting).contains("six lower-case hex digits"));
    assert!(problem_of("home", missing).contains("`white.svg`, which is not in the folder"));
    assert!(problem_of("home", plain).contains("must be https addresses"));
    assert!(problem_of("Home", manifest("")).contains("lower-case letters"));
    assert!(problem_of("home", manifest("").replace("drawn here", " ")).contains("the source of its mark"));
}

#[test]
fn a_mark_that_runs_or_fetches_something_is_refused() {
    assert_eq!(svg_fault(SVG), None);
    assert_eq!(svg_fault("<?xml version=\"1.0\"?><svg><use href=\"#a\"/></svg>"), None);
    assert_eq!(svg_fault("<svg><use xlink:href='#a'/></svg>"), None);
    assert_eq!(svg_fault("<p>hello</p>"), Some("is not one SVG"));
    assert_eq!(svg_fault("<svg><SCRIPT>x</SCRIPT></svg>"), Some("carries a script"));
    assert_eq!(
        svg_fault("<svg><image href=\"https://x.test/a.png\"/></svg>"),
        Some("links outside itself")
    );
}

#[test]
fn a_provider_the_server_does_not_know_has_no_preset() {
    assert!(preset("keycloak").is_some());
    assert!(preset("zitadel").is_some());
    assert!(preset("nope").is_none());
    assert!(preset("").is_none());
    assert!(mark("../presets").is_none());
    assert!(mark("keycloak/white").is_some());
}
