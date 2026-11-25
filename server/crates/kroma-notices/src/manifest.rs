use serde::Serialize;

/// One shipped package: what it is, the license it declares, where its
/// source lives, and the indexes of its notice texts in [`Manifest::texts`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Entry {
    pub kind: &'static str,
    pub name: String,
    pub version: Option<String>,
    pub license: Option<String>,
    pub source: Option<String>,
    pub texts: Vec<usize>,
}

/// A program's third-party notices, in the shape `GET /api/licenses` serves:
/// each distinct text once, and every package pointing at the texts it ships.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct Manifest {
    pub texts: Vec<String>,
    pub entries: Vec<Entry>,
}

/// A package and its notice texts, before [`Manifest::from`] shares them out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub name: String,
    pub version: String,
    pub license: Option<String>,
    pub source: Option<String>,
    pub texts: Vec<String>,
}

impl Manifest {
    fn index(&mut self, text: String) -> usize {
        match self.texts.iter().position(|known| *known == text) {
            Some(index) => index,
            None => {
                self.texts.push(text);
                self.texts.len() - 1
            }
        }
    }
}

impl From<Vec<Notice>> for Manifest {
    fn from(mut notices: Vec<Notice>) -> Self {
        notices.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.version.cmp(&b.version)));
        let mut manifest = Self::default();
        for notice in notices {
            let texts = notice.texts.into_iter().map(|text| manifest.index(text)).collect();
            manifest.entries.push(Entry {
                kind: "crate",
                name: notice.name,
                version: Some(notice.version),
                license: notice.license,
                source: notice.source,
                texts,
            });
        }
        manifest
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notice(name: &str, texts: &[&str]) -> Notice {
        Notice {
            name: name.into(),
            version: "1.0.0".into(),
            license: Some("MIT".into()),
            source: None,
            texts: texts.iter().map(|text| (*text).to_owned()).collect(),
        }
    }

    #[test]
    fn keeps_each_text_once_and_points_every_crate_at_it() {
        let notices = vec![notice("serde", &["MIT", "Apache"]), notice("itoa", &["Apache"])];

        let manifest = Manifest::from(notices);

        assert_eq!(manifest.texts, vec!["Apache", "MIT"]);
        assert_eq!(manifest.entries[0].texts, vec![0]);
        assert_eq!(manifest.entries[1].texts, vec![1, 0]);
    }

    #[test]
    fn orders_the_crates_by_name_then_version() {
        let mut older = notice("serde", &[]);
        older.version = "0.9.0".into();
        let notices = vec![notice("serde", &[]), notice("axum", &[]), older];

        let manifest = Manifest::from(notices);

        let order: Vec<(&str, Option<&str>)> = manifest
            .entries
            .iter()
            .map(|entry| (entry.name.as_str(), entry.version.as_deref()))
            .collect();
        assert_eq!(order, vec![("axum", Some("1.0.0")), ("serde", Some("0.9.0")), ("serde", Some("1.0.0"))]);
    }

    #[test]
    fn serializes_in_the_wire_shape() {
        let manifest = Manifest::from(vec![notice("itoa", &["MIT"])]);

        let json = serde_json::to_value(&manifest).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "texts": ["MIT"],
                "entries": [{
                    "kind": "crate", "name": "itoa", "version": "1.0.0",
                    "license": "MIT", "source": null, "texts": [0],
                }],
            })
        );
    }
}
