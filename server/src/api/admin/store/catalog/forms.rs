//! The form a registry row declares for a contribution: the label it goes by
//! and the fields the host draws before the contribution is used.

use kroma_module_manifest::ConfigField;
use serde_json::Value;

/// What a contribution shows before it is used: the label it goes by and the
/// fields of its form. A contribution that declares neither has none.
pub struct Form {
    pub point: String,
    pub label: Option<String>,
    pub fields: Vec<ConfigField>,
}

pub(super) fn parse(module: &Value) -> Vec<Form> {
    module
        .get("contributes")
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(form_of).collect())
        .unwrap_or_default()
}

fn form_of(contribution: &Value) -> Option<Form> {
    let point = contribution.get("point")?.as_str()?.to_string();
    let label = contribution
        .get("label")
        .and_then(Value::as_str)
        .map(str::to_string);
    let fields: Vec<ConfigField> = contribution
        .get("fields")
        .and_then(|declared| serde_json::from_value(declared.clone()).ok())
        .unwrap_or_default();
    if label.is_none() && fields.is_empty() {
        return None;
    }
    Some(Form {
        point,
        label,
        fields,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_contribution_s_label_and_fields_are_read_as_its_form() {
        let module = json!({
            "id": "tv.x.reader",
            "contributes": [
                {
                    "point": "importer",
                    "label": "Other server",
                    "fields": [
                        { "key": "url", "label": "field.url", "type": "string", "required": true },
                        { "key": "password", "label": "field.password", "type": "string", "secret": true },
                    ],
                },
                { "point": "tv.x.manager/client", "id": "plain" },
            ],
        });

        let forms = parse(&module);

        assert_eq!(forms.len(), 1);
        assert_eq!(forms[0].point, "importer");
        assert_eq!(forms[0].label.as_deref(), Some("Other server"));
        assert!(forms[0].fields[0].required);
        assert!(forms[0].fields[1].secret);
    }

    #[test]
    fn a_form_the_registry_wrote_badly_keeps_its_label_and_loses_its_fields() {
        let module = json!({
            "id": "tv.x.reader",
            "contributes": [{ "point": "importer", "label": "Other server", "fields": [{ "key": 7 }] }],
        });

        let forms = parse(&module);

        assert_eq!(forms[0].label.as_deref(), Some("Other server"));
        assert!(forms[0].fields.is_empty());
    }

    #[test]
    fn a_row_with_no_contribution_has_no_form() {
        assert!(parse(&json!({ "id": "tv.x.reader" })).is_empty());
    }
}
