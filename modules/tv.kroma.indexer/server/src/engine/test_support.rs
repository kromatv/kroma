use crate::definition::Definition;
use crate::IndexerConfig;

pub(super) fn build_def(yaml: &str) -> Definition {
    crate::definition::parse(yaml.as_bytes()).expect("definition fixture must parse")
}

pub(super) fn cfg(base: &str) -> IndexerConfig {
    IndexerConfig {
        base_url: base.to_string(),
        settings: std::collections::HashMap::new(),
    }
}

pub(super) fn cat_def() -> Definition {
    build_def(
        r#"
id: t
name: T
caps:
  categorymappings:
    - {id: "100", cat: "Movies/HD"}
    - {id: "200", cat: "TV/HD"}
search:
  rows:
    selector: "tr"
"#,
    )
}
