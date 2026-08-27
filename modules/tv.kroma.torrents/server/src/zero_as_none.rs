//! A TMDB id crosses the `download-grab` point as a plain integer, `0` for a row
//! nothing has resolved, because the peer that reads it ships on its own tag.

use serde::{Deserialize, Deserializer, Serializer};

pub fn serialize<S: Serializer>(value: &Option<u64>, out: S) -> Result<S::Ok, S::Error> {
    out.serialize_u64(value.unwrap_or(0))
}

pub fn deserialize<'de, D: Deserializer<'de>>(input: D) -> Result<Option<u64>, D::Error> {
    Ok(Option::<u64>::deserialize(input)?.filter(|id| *id != 0))
}

#[cfg(test)]
mod tests {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
    struct Row {
        #[serde(with = "super")]
        tmdb_id: Option<u64>,
    }

    #[test]
    fn an_unresolved_id_crosses_as_zero_and_comes_back_as_nothing() {
        let unresolved = Row { tmdb_id: None };

        let json = serde_json::to_value(&unresolved).unwrap();

        assert_eq!(json["tmdb_id"], 0);
        assert_eq!(serde_json::from_value::<Row>(json).unwrap(), unresolved);
    }

    #[test]
    fn a_resolved_id_crosses_as_itself() {
        let linked = Row { tmdb_id: Some(603) };

        let json = serde_json::to_value(&linked).unwrap();

        assert_eq!(json["tmdb_id"], 603);
        assert_eq!(serde_json::from_value::<Row>(json).unwrap(), linked);
    }

    #[test]
    fn a_peer_that_sends_null_reads_as_nothing() {
        let json = serde_json::json!({ "tmdb_id": null });

        let row: Row = serde_json::from_value(json).unwrap();

        assert_eq!(row.tmdb_id, None);
    }
}
