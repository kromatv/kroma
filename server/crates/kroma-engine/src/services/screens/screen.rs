//! What a device answers when asked what is on its screen: the kit components
//! it has mounted, as flat rows in document order. Typed to exactly this shape,
//! so nothing a device adds travels on to the admin who asked.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// The most rows one answer may carry.
pub const MAX_ROWS: usize = 2000;
const MAX_NAME_BYTES: usize = 128;
const MAX_PROPS: usize = 32;
const MAX_KEY_BYTES: usize = 128;
const MAX_TEXT_BYTES: usize = 512;

/// A device's screen: how many fibers it read, whether rows were cut at
/// [`MAX_ROWS`], and the rows.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Screen {
    pub fibers: u64,
    pub truncated: bool,
    pub rows: Vec<ScreenRow>,
}

/// One mounted kit component, `depth` levels under the screen's top.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScreenRow {
    pub depth: u32,
    pub name: String,
    pub props: BTreeMap<String, PropValue>,
    #[serde(rename = "box")]
    pub bounds: Option<ScreenBox>,
}

/// Where a component sits, in the device's viewport pixels.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScreenBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// One summarized prop: a primitive, never a nested value.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropValue {
    Flag(bool),
    Number(f64),
    Text(String),
    Null,
}

impl Screen {
    /// Whether every row and every string stays inside the bounds a reader
    /// produces.
    pub fn within_bounds(&self) -> bool {
        self.rows.len() <= MAX_ROWS && self.rows.iter().all(ScreenRow::within_bounds)
    }
}

impl ScreenRow {
    fn within_bounds(&self) -> bool {
        usize::try_from(self.depth).is_ok_and(|depth| depth <= MAX_ROWS)
            && !self.name.is_empty()
            && self.name.len() <= MAX_NAME_BYTES
            && self.props.len() <= MAX_PROPS
            && self
                .props
                .iter()
                .all(|(key, value)| key.len() <= MAX_KEY_BYTES && value.within_bounds())
    }
}

impl PropValue {
    fn within_bounds(&self) -> bool {
        match self {
            Self::Text(text) => text.len() <= MAX_TEXT_BYTES,
            Self::Flag(_) | Self::Number(_) | Self::Null => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn row(depth: u32, name: &str) -> serde_json::Value {
        json!({ "depth": depth, "name": name, "props": {}, "box": null })
    }

    fn screen_of(rows: Vec<serde_json::Value>) -> Screen {
        serde_json::from_value(json!({ "fibers": 10, "truncated": false, "rows": rows }))
            .expect("a screen")
    }

    #[test]
    fn a_row_reads_every_kind_of_prop_and_its_box() {
        let value = json!({
            "depth": 2,
            "name": "Dialog.Footer",
            "props": { "open": true, "size": 3, "title": "Réglages", "icon": null },
            "box": { "x": 0, "y": 10.5, "width": 1920, "height": 80 },
        });

        let row: ScreenRow = serde_json::from_value(value.clone()).expect("a row");

        assert_eq!(row.props["open"], PropValue::Flag(true));
        assert_eq!(row.props["size"], PropValue::Number(3.0));
        assert_eq!(row.props["title"], PropValue::Text("Réglages".into()));
        assert_eq!(row.props["icon"], PropValue::Null);
        assert_eq!(row.bounds.as_ref().map(|b| b.width), Some(1920.0));
    }

    #[test]
    fn a_nested_prop_is_not_a_row() {
        let value =
            json!({ "depth": 0, "name": "Box", "props": { "style": { "a": 1 } }, "box": null });

        assert!(serde_json::from_value::<ScreenRow>(value).is_err());
    }

    #[test]
    fn a_field_the_reader_does_not_send_is_dropped_on_the_way_through() {
        let value = json!({ "depth": 0, "name": "Box", "props": {}, "box": null, "extra": [1, 2] });

        let row: ScreenRow = serde_json::from_value(value).expect("a row");

        assert!(!serde_json::to_string(&row).unwrap().contains("extra"));
    }

    #[test]
    fn a_screen_past_the_row_limit_is_out_of_bounds() {
        let at_limit = screen_of(vec![row(0, "Box"); MAX_ROWS]);
        let past_limit = screen_of(vec![row(0, "Box"); MAX_ROWS + 1]);

        assert!(at_limit.within_bounds());
        assert!(!past_limit.within_bounds());
    }

    #[test]
    fn a_long_name_a_long_text_or_an_empty_name_is_out_of_bounds() {
        let long_name = screen_of(vec![row(0, &"N".repeat(MAX_NAME_BYTES + 1))]);
        let empty_name = screen_of(vec![row(0, "")]);
        let mut long_text = screen_of(vec![row(0, "Text")]);
        long_text.rows[0].props.insert(
            "children".into(),
            PropValue::Text("t".repeat(MAX_TEXT_BYTES + 1)),
        );

        assert!(!long_name.within_bounds());
        assert!(!empty_name.within_bounds());
        assert!(!long_text.within_bounds());
    }
}
