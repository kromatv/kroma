pub(super) const MINIMAL: &str = "\
id: demo
name: Demo Tracker
caps: {}
search:
  rows: {}
";

pub(super) fn parse_ok(yaml: &str) -> super::Definition {
    super::parse(yaml.as_bytes()).expect("definition should parse")
}
