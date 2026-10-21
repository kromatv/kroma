use indexmap::IndexMap;
use serde::Deserialize;

use super::scalar::{de_string_or_seq, ScalarString};
use super::Selector;

#[derive(Debug, Clone, Deserialize)]
pub struct Login {
    // `form` | `post` | `get` | `cookie` | `oneurl` | `getpost`.
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub submitpath: Option<String>,
    #[serde(default)]
    pub form: Option<String>,
    #[serde(default)]
    pub inputs: IndexMap<String, ScalarString>,
    #[serde(default)]
    pub selectorinputs: IndexMap<String, Selector>,
    #[serde(default, deserialize_with = "de_string_or_seq")]
    pub cookies: Vec<String>,
    #[serde(default)]
    pub error: Vec<LoginError>,
    #[serde(default)]
    pub test: Option<LoginTest>,
    #[serde(default)]
    pub captcha: Option<Captcha>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoginError {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub message: Option<Message>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Message {
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoginTest {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub selector: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Captcha {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub input: Option<String>,
}

#[cfg(test)]
mod tests {
    use crate::definition::test_support::{parse_ok, MINIMAL};

    #[test]
    fn a_login_block_reads_every_shape_the_engine_supports() {
        let d = parse_ok(&format!(
            "{MINIMAL}\
login:
  method: form
  path: /login.php
  submitpath: /takelogin.php
  form: form#loginform
  inputs:
    username: '{{{{ .Config.username }}}}'
    keeplogged: 1
  selectorinputs:
    csrf:
      selector: input[name=csrf]
      attribute: value
  error:
    - selector: div.error
      message: {{selector: div.error}}
    - message: {{text: Login failed}}
  test:
    path: /index.php
    selector: a[href*=logout]
  captcha:
    type: image
    selector: img#captcha
    input: captchainput
"
        ));
        let login = d.login.unwrap();
        assert_eq!(login.method.as_deref(), Some("form"));
        assert_eq!(login.submitpath.as_deref(), Some("/takelogin.php"));
        assert_eq!(login.form.as_deref(), Some("form#loginform"));
        assert_eq!(&*login.inputs["username"], "{{ .Config.username }}");
        assert_eq!(&*login.inputs["keeplogged"], "1");
        assert_eq!(
            login.selectorinputs["csrf"].attribute.as_deref(),
            Some("value")
        );
        assert_eq!(login.error.len(), 2);
        assert_eq!(login.error[0].selector.as_deref(), Some("div.error"));
        assert_eq!(login.error[1].selector, None);
        assert_eq!(
            login.error[1].message.as_ref().unwrap().text.as_deref(),
            Some("Login failed")
        );
        assert_eq!(
            login.test.unwrap().selector.as_deref(),
            Some("a[href*=logout]")
        );
        assert_eq!(login.captcha.unwrap().kind, "image");
    }
}
